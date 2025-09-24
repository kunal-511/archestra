import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import ImageGenerationService from '@backend/services/imageGeneration';
import { ErrorResponseSchema, DetailedErrorResponseSchema } from '@backend/schemas';

const ImageGenerationRequestSchema = z.object({
  model: z.string().describe('The image model to use for generation'),
  prompt: z.string().min(1).describe('The text prompt for image generation'),
  provider: z.string().optional().describe('Override provider (e.g., "openai", "gemini")'),
  size: z.string().optional().describe('Image size in format "widthxheight" (e.g., "1024x1024")'),
  aspectRatio: z.string().optional().describe('Aspect ratio in format "width:height" (e.g., "16:9")'),
  n: z.number().int().min(1).max(10).default(1).describe('Number of images to generate'),
  seed: z.number().int().optional().describe('Seed for reproducible generation'),
  providerOptions: z.record(z.string(), z.any()).optional().describe('Provider-specific options'),
});

const GeneratedImageSchema = z.object({
  base64: z.string().describe('Base64 encoded image data'),
  uint8Array: z.any().describe('Raw image data as Uint8Array'),
});

const ImageGenerationResponseSchema = z.object({
  images: z.array(GeneratedImageSchema).describe('Generated images'),
  warnings: z.array(z.string()).optional().describe('Any warnings from the generation process'),
  providerMetadata: z.record(z.string(), z.any()).optional().describe('Provider-specific metadata'),
});

const ImageModelSchema = z.object({
  id: z.string().describe('Model identifier'),
  provider: z.string().describe('Provider name'),
  name: z.string().describe('Human-readable model name'),
  supportsSize: z.boolean().describe('Whether model supports size parameter'),
  supportsAspectRatio: z.boolean().describe('Whether model supports aspect ratio parameter'),
  supportedSizes: z.array(z.string()).optional().describe('List of supported sizes'),
  supportedAspectRatios: z.array(z.string()).optional().describe('List of supported aspect ratios'),
  maxImages: z.number().int().optional().describe('Maximum images per request'),
});

const ValidationErrorSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
});

// Register schemas in global registry for OpenAPI generation
z.globalRegistry.add(ImageGenerationRequestSchema, { id: 'ImageGenerationRequest' });
z.globalRegistry.add(ImageGenerationResponseSchema, { id: 'ImageGenerationResponse' });
z.globalRegistry.add(ImageModelSchema, { id: 'ImageModel' });
z.globalRegistry.add(ValidationErrorSchema, { id: 'ValidationError' });

const imageGenerationRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Generate images
  fastify.post(
    '/api/image-generation/generate',
    {
      schema: {
        operationId: 'generateImage',
        description: 'Generate images using AI image models',
        tags: ['Image Generation'],
        body: ImageGenerationRequestSchema,
        response: {
          200: ImageGenerationResponseSchema,
          400: DetailedErrorResponseSchema,
          500: DetailedErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Validate the request
        const validation = ImageGenerationService.validateImageGenerationRequest(request.body);
        if (!validation.valid) {
          return reply.status(400).send({
            error: 'Invalid image generation request',
            details: validation.errors.join(', '),
          });
        }

        // Generate the images
        const result = await ImageGenerationService.generateImage(request.body);

        return reply.code(200).send(result);
      } catch (error) {
        fastify.log.error('Image generation error:', error instanceof Error ? error.stack || error.message : error);
        return reply.status(500).send({
          error: 'Failed to generate image',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Get supported image models
  fastify.get(
    '/api/image-generation/models',
    {
      schema: {
        operationId: 'getSupportedImageModels',
        description: 'Get list of supported image generation models',
        tags: ['Image Generation'],
        response: {
          200: z.array(ImageModelSchema),
        },
      },
    },
    async (_request, reply) => {
      const models = ImageGenerationService.getSupportedImageModels();
      return reply.code(200).send(models);
    }
  );

  // Get available image models (based on configured providers)
  fastify.get(
    '/api/image-generation/models/available',
    {
      schema: {
        operationId: 'getAvailableImageModels',
        description: 'Get list of currently available image generation models based on configured providers',
        tags: ['Image Generation'],
        response: {
          200: z.array(ImageModelSchema),
          500: DetailedErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        const models = await ImageGenerationService.getAvailableImageModels();
        return reply.code(200).send(models);
      } catch (error) {
        fastify.log.error('Error fetching available image models:', error);
        return reply.status(500).send({
          error: 'Failed to fetch available models',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Get image model by ID
  fastify.get(
    '/api/image-generation/models/:modelId',
    {
      schema: {
        operationId: 'getImageModelById',
        description: 'Get details for a specific image model',
        tags: ['Image Generation'],
        params: z.object({
          modelId: z.string().describe('The model ID to retrieve'),
        }),
        response: {
          200: ImageModelSchema,
          404: DetailedErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { modelId } = request.params;
      const model = ImageGenerationService.getImageModelById(modelId);

      if (!model) {
        return reply.status(404).send({
          error: 'Image model not found',
          details: `No image model found with ID: ${modelId}`,
        });
      }

      return reply.code(200).send(model);
    }
  );

  // Validate image generation request
  fastify.post(
    '/api/image-generation/validate',
    {
      schema: {
        operationId: 'validateImageGenerationRequest',
        description: 'Validate an image generation request without generating images',
        tags: ['Image Generation'],
        body: ImageGenerationRequestSchema,
        response: {
          200: ValidationErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const validation = ImageGenerationService.validateImageGenerationRequest(request.body);
      return reply.code(200).send(validation);
    }
  );

  // Check if a model supports image generation
  fastify.get(
    '/api/image-generation/models/:modelId/check',
    {
      schema: {
        operationId: 'checkImageGenerationSupport',
        description: 'Check if a model supports image generation',
        tags: ['Image Generation'],
        params: z.object({
          modelId: z.string().describe('The model ID to check'),
        }),
        response: {
          200: z.object({
            modelId: z.string(),
            supportsImageGeneration: z.boolean(),
            modelInfo: ImageModelSchema.optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { modelId } = request.params;
      const supportsImageGeneration = ImageGenerationService.isImageGenerationModel(modelId);
      const modelInfo = supportsImageGeneration ? ImageGenerationService.getImageModelById(modelId) : undefined;

      return reply.code(200).send({
        modelId,
        supportsImageGeneration,
        modelInfo,
      });
    }
  );
};

export default imageGenerationRoutes;