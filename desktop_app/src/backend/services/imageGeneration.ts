import { experimental_generateImage as generateImage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider-v2';

import config from '@backend/config';
import CloudProviderModel, { type SupportedImageGenerationProvider } from '@backend/models/cloudProvider';

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  provider?: string;
  size?: string;
  aspectRatio?: string;
  n?: number;
  seed?: number;
  providerOptions?: Record<string, any>;
}

export interface GeneratedImage {
  base64: string;
  uint8Array: Uint8Array;
}

export interface ImageGenerationResponse {
  images: GeneratedImage[];
  warnings?: string[];
  providerMetadata?: Record<string, any>;
}

export interface ImageModel {
  id: string;
  provider: string;
  name: string;
  supportsSize: boolean;
  supportsAspectRatio: boolean;
  supportedSizes?: string[];
  supportedAspectRatios?: string[];
  maxImages?: number;
}

const createImageModelInstance = async (model: string, provider?: string) => {
  if (provider === 'ollama') {
    // Ollama doesn't support image generation currently, throw error
    throw new Error('Ollama does not currently support image generation');
  }

  // Try image model config first, then fall back to regular model config
  let providerConfig = await CloudProviderModel.getProviderConfigForImageModel(model);

  if (!providerConfig) {
    providerConfig = await CloudProviderModel.getProviderConfigForModel(model);
  }

  if (!providerConfig) {
    return openai.image(model);
  }

  const { apiKey, provider: providerData } = providerConfig;
  const { type, baseUrl, headers } = providerData;

  // Only create image clients for providers that support image generation
  const imageClientFactories: Record<SupportedImageGenerationProvider, () => any> = {
    openai: () => createOpenAI({ apiKey, baseURL: baseUrl, headers }),
    gemini: () => createGoogleGenerativeAI({ apiKey, baseURL: baseUrl }),
  };

  const createClient = imageClientFactories[type as SupportedImageGenerationProvider];

  if (!createClient) {
    throw new Error(`Provider ${type} does not support image generation`);
  }

  const client = createClient();
  return (client as any).image(model);
};

class ImageGenerationService {
  private static supportedImageModels: ImageModel[] = [
    // OpenAI Models
    {
      id: 'gpt-image-1',
      provider: 'openai',
      name: 'GPT Image 1',
      supportsSize: true,
      supportsAspectRatio: false,
      supportedSizes: ['1024x1024', '1536x1024', '1024x1536'],
      maxImages: 1,
    },
    {
      id: 'dall-e-3',
      provider: 'openai',
      name: 'DALL-E 3',
      supportsSize: true,
      supportsAspectRatio: false,
      supportedSizes: ['1024x1024', '1792x1024', '1024x1792'],
      maxImages: 1,
    },
    {
      id: 'dall-e-2',
      provider: 'openai',
      name: 'DALL-E 2',
      supportsSize: true,
      supportsAspectRatio: false,
      supportedSizes: ['256x256', '512x512', '1024x1024'],
      maxImages: 10,
    },
    // Google Models
    {
      id: 'imagen-3.0-generate-002',
      provider: 'gemini',
      name: 'Imagen 3.0',
      supportsSize: false,
      supportsAspectRatio: true,
      supportedAspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
      maxImages: 4,
    },
    // DeepSeek Models (if they support image generation in the future)
    // Anthropic Models (if they support image generation in the future)
  ];

  static async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const {
      model,
      prompt,
      provider,
      size,
      aspectRatio,
      n = 1,
      seed,
      providerOptions = {},
    } = request;

    try {
      const modelInstance = await createImageModelInstance(model, provider);

      const generateConfig: any = {
        model: modelInstance,
        prompt,
        ...(n > 1 && { n }),
        ...(seed && { seed }),
        ...(Object.keys(providerOptions).length > 0 && { providerOptions }),
      };

      // Add size parameter with proper type validation
      if (size && /^\d+x\d+$/.test(size)) {
        generateConfig.size = size as `${number}x${number}`;
      }

      // Add aspectRatio parameter with proper type validation
      if (aspectRatio && /^\d+:\d+$/.test(aspectRatio)) {
        generateConfig.aspectRatio = aspectRatio as `${number}:${number}`;
      }

      const result = await generateImage(generateConfig);

      // Handle both single and multiple image responses
      const images = result.images || [result.image];

      return {
        images: images.map((img) => ({
          base64: img.base64,
          uint8Array: img.uint8Array,
        })),
        warnings: result.warnings?.map((warning: any) =>
          typeof warning === 'string' ? warning : JSON.stringify(warning)
        ),
        providerMetadata: result.providerMetadata,
      };
    } catch (error) {
      throw new Error(`Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static getSupportedImageModels(): ImageModel[] {
    return this.supportedImageModels;
  }

  static getImageModelById(modelId: string): ImageModel | undefined {
    return this.supportedImageModels.find((model) => model.id === modelId);
  }

  static getImageModelsByProvider(provider: string): ImageModel[] {
    return this.supportedImageModels.filter((model) => model.provider === provider);
  }

  static isImageGenerationModel(modelId: string): boolean {
    return this.supportedImageModels.some((model) => model.id === modelId);
  }

  static validateImageGenerationRequest(request: ImageGenerationRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if model is supported
    const modelInfo = this.getImageModelById(request.model);
    if (!modelInfo) {
      errors.push(`Unsupported image model: ${request.model}`);
      return { valid: false, errors };
    }

    // Validate size parameter
    if (request.size && !modelInfo.supportsSize) {
      errors.push(`Model ${request.model} does not support size parameter`);
    } else if (request.size && modelInfo.supportedSizes && !modelInfo.supportedSizes.includes(request.size)) {
      errors.push(`Unsupported size ${request.size} for model ${request.model}. Supported sizes: ${modelInfo.supportedSizes.join(', ')}`);
    }

    // Validate aspect ratio parameter
    if (request.aspectRatio && !modelInfo.supportsAspectRatio) {
      errors.push(`Model ${request.model} does not support aspectRatio parameter`);
    } else if (request.aspectRatio && modelInfo.supportedAspectRatios && !modelInfo.supportedAspectRatios.includes(request.aspectRatio)) {
      errors.push(`Unsupported aspect ratio ${request.aspectRatio} for model ${request.model}. Supported ratios: ${modelInfo.supportedAspectRatios.join(', ')}`);
    }

    // Validate number of images
    if (request.n && modelInfo.maxImages && request.n > modelInfo.maxImages) {
      errors.push(`Model ${request.model} supports maximum ${modelInfo.maxImages} images per request`);
    }

    // Validate prompt
    if (!request.prompt || request.prompt.trim().length === 0) {
      errors.push('Prompt is required and cannot be empty');
    }

    return { valid: errors.length === 0, errors };
  }

  static async getAvailableImageModels(): Promise<ImageModel[]> {
    const availableProviders = await CloudProviderModel.getAllProvidersWithConfig();
    const enabledProviderTypes = availableProviders
      .filter((p) => p.configured && p.enabled)
      .map((p) => p.type);

    // Don't include ollama since it doesn't support image generation

    // Get all available cloud provider image models
    const cloudImageModels = await CloudProviderModel.getAvailableImageModels();

    // Combine with our static models and filter by enabled providers
    const allModels = [
      ...this.supportedImageModels.filter((model) =>
        enabledProviderTypes.includes(model.provider as any) && model.provider !== 'ollama'
      ),
      // Add cloud provider models that aren't in our static list
      ...cloudImageModels
        .filter((cloudModel) =>
          !this.supportedImageModels.some((staticModel) => staticModel.id === cloudModel.id)
        )
        .map((cloudModel) => ({
          id: cloudModel.id,
          provider: cloudModel.provider,
          name: cloudModel.id,
          supportsSize: cloudModel.provider === 'openai',
          supportsAspectRatio: cloudModel.provider === 'gemini',
          maxImages: cloudModel.provider === 'openai' ? (cloudModel.id === 'dall-e-2' ? 10 : 1) : 4,
        }))
    ];

    return allModels;
  }
}

export default ImageGenerationService;