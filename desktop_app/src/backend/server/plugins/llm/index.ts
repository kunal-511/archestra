import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createOllama } from 'ollama-ai-provider-v2';
import { z } from 'zod';

import ollamaClient from '@backend/clients/ollama';
import config from '@backend/config';
import Chat from '@backend/models/chat';
import CloudProviderModel from '@backend/models/cloudProvider';
import { archestraMcpContext } from '@backend/server/plugins/mcp';
import { ErrorResponseSchema, DetailedErrorResponseSchema } from '@backend/schemas';
import ImageGenerationService from '@backend/services/imageGeneration';
import toolService from '@backend/services/tool';
import { type McpTools } from '@backend/types';

import sharedConfig from '../../../../config';
import { getModelContextWindow } from './modelContextWindows';

interface StreamRequestBody {
  model: string;
  messages: Array<any>;
  sessionId?: string;
  provider?: string;
  requestedTools?: string[]; // Tool IDs requested by frontend
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string };
  chatId?: number; // Chat ID to get chat-specific tools
}

interface ImageGenerationRequestBody {
  model: string;
  prompt: string;
  provider?: string;
  size?: string;
  aspectRatio?: string;
  n?: number;
  seed?: number;
  providerOptions?: Record<string, any>;
  sessionId?: string;
  chatId?: number;
}

const ImageGenerationRequestSchema = z.object({
  model: z.string().describe('The image model to use for generation'),
  prompt: z.string().min(1).describe('The text prompt for image generation'),
  provider: z.string().optional().describe('Override provider (e.g., "openai", "gemini")'),
  size: z.string().optional().describe('Image size in format "widthxheight" (e.g., "1024x1024")'),
  aspectRatio: z.string().optional().describe('Aspect ratio in format "width:height" (e.g., "16:9")'),
  n: z.number().int().min(1).max(10).default(1).describe('Number of images to generate'),
  seed: z.number().int().optional().describe('Seed for reproducible generation'),
  providerOptions: z.record(z.string(), z.any()).optional().describe('Provider-specific options'),
  sessionId: z.string().optional().describe('Session ID for tracking'),
  chatId: z.number().int().optional().describe('Chat ID to associate with'),
});

const ImageGenerationResponseSchema = z.object({
  images: z.array(z.object({
    base64: z.string().describe('Base64 encoded image data'),
    dataUrl: z.string().describe('Data URL format for display'),
  })).describe('Generated images'),
  warnings: z.array(z.string()).optional().describe('Any warnings from the generation process'),
  providerMetadata: z.record(z.string(), z.any()).optional().describe('Provider-specific metadata'),
});

// Register schemas for OpenAPI
z.globalRegistry.add(ImageGenerationRequestSchema, { id: 'LlmImageGenerationRequest' });
z.globalRegistry.add(ImageGenerationResponseSchema, { id: 'LlmImageGenerationResponse' });

const { vercelSdk: vercelSdkConfig } = sharedConfig;

const createModelInstance = async (model: string, provider?: string) => {
  if (provider === 'ollama') {
    const baseUrl = config.ollama.server.host + '/api';
    const ollamaClient = createOllama({ baseURL: baseUrl });
    return ollamaClient(model);
  }

  const providerConfig = await CloudProviderModel.getProviderConfigForModel(model);

  if (!providerConfig) {
    return openai(model);
  }

  const { apiKey, provider: providerData } = providerConfig;
  const { type, baseUrl, headers } = providerData;

  const clientFactories = {
    anthropic: () => createAnthropic({ apiKey, baseURL: baseUrl }),
    openai: () => createOpenAI({ apiKey, baseURL: baseUrl, headers }),
    deepseek: () => createDeepSeek({ apiKey, baseURL: baseUrl || 'https://api.deepseek.com/v1' }),
    gemini: () => createGoogleGenerativeAI({ apiKey, baseURL: baseUrl }),
    ollama: () => createOllama({ baseURL: baseUrl }),
  };

  const createClient = clientFactories[type] || (() => createOpenAI({ apiKey, baseURL: baseUrl, headers }));
  const client = createClient();

  return client(model);
};

const llmRoutes: FastifyPluginAsync = async (fastify) => {
  // Note: Tools are aggregated from both sandboxed servers and Archestra MCP server
  // Based on this doc: https://ai-sdk.dev/docs/ai-sdk-core/generating-text
  fastify.post<{ Body: StreamRequestBody }>(
    '/api/llm/stream',
    {
      schema: {
        operationId: 'streamLlmResponse',
        description: 'Stream LLM response',
        tags: ['LLM'],
      },
    },
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
      const { messages, sessionId, model = 'gpt-4o', provider, requestedTools, toolChoice, chatId } = request.body;
      const isOllama = provider === 'ollama';

      try {
        // Set the chat context for Archestra MCP tools
        if (chatId) {
          archestraMcpContext.setCurrentChatId(chatId);
        }

        // Get tools based on chat selection or requested tools
        let tools: McpTools = {};

        if (chatId) {
          // Get chat-specific tool selection
          const chatSelectedTools = await Chat.getSelectedTools(chatId);

          if (chatSelectedTools === null) {
            // null means all tools are selected
            tools = toolService.getAllTools();
          } else if (chatSelectedTools.length > 0) {
            // Use only the selected tools for this chat
            tools = toolService.getToolsById(chatSelectedTools);
          }
          // If chatSelectedTools is empty array, tools remains empty (no tools enabled)
        } else if (requestedTools && requestedTools.length > 0) {
          // Fallback to requested tools if no chatId
          tools = toolService.getToolsById(requestedTools);
        } else {
          // Default to all tools if no specific selection
          tools = toolService.getAllTools();
        }

        // Wrap tools with approval logic
        const wrappedTools: any = {};
        for (const [toolId, tool] of Object.entries(tools)) {
          wrappedTools[toolId] = toolService.wrapToolWithApproval(tool, toolId, sessionId || '', chatId || 0);
        }

        // Create the stream with the appropriate model
        const streamConfig: Parameters<typeof streamText>[0] = {
          model: await createModelInstance(model, provider),
          messages: convertToModelMessages(messages),
          stopWhen: stepCountIs(vercelSdkConfig.maxToolCalls),
          providerOptions: {
            /**
             * The following options are available for the OpenAI provider
             * https://ai-sdk.dev/providers/ai-sdk-providers/openai#responses-models
             */
            openai: {
              /**
               * A cache key for manual prompt caching control.
               * Used by OpenAI to cache responses for similar requests to optimize your cache hit rates.
               */
              ...(chatId || sessionId
                ? {
                    promptCacheKey: chatId ? `chat-${chatId}` : sessionId ? `session-${sessionId}` : undefined,
                  }
                : {}),
              /**
               * maxToolCalls for the most part is handled by stopWhen, but openAI provider also has its
               * own unique config for this
               */
              maxToolCalls: vercelSdkConfig.maxToolCalls,
            },
            ollama: {},
          },
          onFinish: async ({ response, usage, text: _text, finishReason: _finishReason }) => {
            if (usage && sessionId) {
              const tokenUsage = {
                promptTokens: usage.inputTokens,
                completionTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
                model: model,
                contextWindow: isOllama
                  ? await ollamaClient.getModelContextWindow(model)
                  : getModelContextWindow(model),
              };

              await Chat.updateTokenUsage(sessionId, tokenUsage);

              fastify.log.info(`Token usage saved for chat: ${JSON.stringify(tokenUsage)}`);
            }
          },
        };

        // Only add tools and toolChoice if tools are available
        if (wrappedTools && Object.keys(wrappedTools).length > 0) {
          streamConfig.tools = wrappedTools;
          streamConfig.toolChoice = toolChoice || 'auto';
        }

        const result = streamText(streamConfig);

        return reply.send(
          result.toUIMessageStreamResponse({
            originalMessages: messages,
            onError: (error) => {
              return JSON.stringify(error);
            },
            onFinish: ({ messages }) => {
              if (sessionId) {
                // Check if last message has empty parts and strip it if so
                if (messages.length > 0 && messages[messages.length - 1].parts.length === 0) {
                  messages = messages.slice(0, -1);
                }
                // Only save if there are messages remaining
                if (messages.length > 0) {
                  Chat.saveMessages(sessionId, messages);
                }
              }
            },
          })
        );
      } catch (error) {
        fastify.log.error('LLM streaming error:', error instanceof Error ? error.stack || error.message : error);
        return reply.code(500).send({
          error: 'Failed to stream response',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Image generation endpoint
  fastify.post<{ Body: ImageGenerationRequestBody }>(
    '/api/llm/generate-image',
    {
      schema: {
        operationId: 'generateImageLlm',
        description: 'Generate images using LLM-integrated image models',
        tags: ['LLM', 'Image Generation'],
        body: ImageGenerationRequestSchema,
        response: {
          200: ImageGenerationResponseSchema,
          400: DetailedErrorResponseSchema,
          500: DetailedErrorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest<{ Body: ImageGenerationRequestBody }>, reply: FastifyReply) => {
      const { model, prompt, provider, size, aspectRatio, n, seed, providerOptions, sessionId, chatId } = request.body;

      try {
        // Validate that the model supports image generation
        if (!ImageGenerationService.isImageGenerationModel(model)) {
          return reply.status(400).send({
            error: 'Invalid model for image generation',
            details: `Model ${model} does not support image generation. Use /api/image-generation/models/available to see supported models.`,
          });
        }

        // Validate the image generation request
        const validation = ImageGenerationService.validateImageGenerationRequest({
          model,
          prompt,
          provider,
          size,
          aspectRatio,
          n,
          seed,
          providerOptions,
        });

        if (!validation.valid) {
          return reply.status(400).send({
            error: 'Invalid image generation request',
            details: validation.errors.join(', '),
          });
        }

        // Generate the images
        const result = await ImageGenerationService.generateImage({
          model,
          prompt,
          provider,
          size,
          aspectRatio,
          n,
          seed,
          providerOptions,
        });

        // Convert images to data URLs for easier display
        const imagesWithDataUrls = result.images.map((img) => ({
          base64: img.base64,
          dataUrl: `data:image/png;base64,${img.base64}`,
        }));

        // Save the generation result to chat if sessionId provided
        if (sessionId) {
          // Create a synthetic message representing the image generation
          const imageMessage: any = {
            id: `img-${Date.now()}`,
            role: 'assistant' as const,
            parts: [
              {
                type: 'text' as const,
                text: `Generated ${imagesWithDataUrls.length} image${imagesWithDataUrls.length > 1 ? 's' : ''} for: "${prompt}"`,
              },
              ...imagesWithDataUrls.map((img, index) => ({
                type: `data-image-${index}` as const,
                id: `image-${index}`,
                data: {
                  type: 'image',
                  image: img.dataUrl,
                  alt: `Generated image ${index + 1}: ${prompt}`,
                },
              })),
            ],
          };

          // Save the user's prompt and the generated image as messages
          const userMessage: any = {
            id: `user-${Date.now()}`,
            role: 'user' as const,
            parts: [{ type: 'text' as const, text: prompt }],
          };

          await Chat.saveMessages(sessionId, [userMessage, imageMessage]);
        }

        const response = {
          images: imagesWithDataUrls,
          warnings: result.warnings,
          providerMetadata: result.providerMetadata,
        };

        return reply.code(200).send(response);
      } catch (error) {
        fastify.log.error('Image generation error:', error instanceof Error ? error.stack || error.message : error);
        return reply.status(500).send({
          error: 'Failed to generate image',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};

export default llmRoutes;
