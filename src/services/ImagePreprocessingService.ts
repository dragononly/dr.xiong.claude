/**
 * Image Preprocessing Tool
 *
 * 功能：
 * - 使用 GLM 视觉模型识别图片内容
 * - 将图片转换为文本描述
 * - 用于在对话中处理图片附件
 */

import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';
import { IGLMClient, GLMMessage } from './ai/GLMClient';

// 本地定义 AttachmentPayload，避免循环依赖
export interface AttachmentPayload {
    fileName: string;
    mediaType: string;
    data: string;
    fileSize?: number;
}

export const IImagePreprocessingService = createDecorator<IImagePreprocessingService>('imagePreprocessingService');

/**
 * 图片识别结果
 */
export interface ImageRecognitionResult {
    /** 图片描述 */
    description: string;
    /** 识别的文本内容（如果有） */
    extractedText?: string;
    /** 使用的模型 */
    model: string;
    /** Token 使用量 */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * 图片预处理服务接口
 */
export interface IImagePreprocessingService {
    readonly _serviceBrand: undefined;

    /**
     * 识别单张图片
     * @param attachment 图片附件
     * @param additionalPrompt 额外的提示词（可选）
     * @returns 图片识别结果
     */
    recognizeImage(attachment: AttachmentPayload, additionalPrompt?: string): Promise<ImageRecognitionResult>;

    /**
     * 批量识别多张图片
     * @param attachments 图片附件列表
     * @param additionalPrompt 额外的提示词（可选）
     * @returns 图片识别结果列表
     */
    recognizeImages(attachments: AttachmentPayload[], additionalPrompt?: string): Promise<ImageRecognitionResult[]>;

    /**
     * 将图片识别结果转换为文本提示词
     * @param results 图片识别结果列表
     * @returns 格式化的文本提示词
     */
    formatAsPrompt(results: ImageRecognitionResult[]): string;
}

// ============== 实现 ==============

/**
 * 默认提示词模板
 */
const DEFAULT_RECOGNITION_PROMPT = `请仔细观察这张图片，并提供详细的描述。包括：
1. 图片的主要内容
2. 图片中的文字内容（如果有）
3. 图片的细节和特点
4. 图片的用途或含义（如果适用）

请用中文回答。`;

/**
 * ImagePreprocessingService 实现
 */
export class ImagePreprocessingService implements IImagePreprocessingService {
    readonly _serviceBrand: undefined;

    constructor(
        @ILogService private readonly logService: ILogService,
        @IGLMClient private readonly glmClient: IGLMClient
    ) {}

    /**
     * 识别单张图片
     */
    async recognizeImage(attachment: AttachmentPayload, additionalPrompt?: string): Promise<ImageRecognitionResult> {
        this.logService.info(`[ImagePreprocessing] 开始识别图片: ${attachment.fileName}`);

        // 构建消息
        const message: GLMMessage = {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: additionalPrompt || DEFAULT_RECOGNITION_PROMPT,
                },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:${attachment.mediaType};base64,${attachment.data}`,
                    },
                },
            ],
        };

        // 调用 GLM API
        try {
            const response = await this.glmClient.sendMessage({
                model: '', // 使用默认模型（由 GLMClient 从配置读取）
                messages: [message],
                max_tokens: 2048,
                temperature: 0.3, // 较低温度以获得更准确的描述
            });

            const description = response.choices[0]?.message?.content || '';

            this.logService.info(`[ImagePreprocessing] 图片识别完成，tokens: ${response.usage.total_tokens}`);

            return {
                description,
                model: response.model,
                usage: {
                    promptTokens: response.usage.prompt_tokens,
                    completionTokens: response.usage.completion_tokens,
                    totalTokens: response.usage.total_tokens,
                },
            };
        } catch (error) {
            this.logService.error(`[ImagePreprocessing] 图片识别失败: ${error}`);
            throw error;
        }
    }

    /**
     * 批量识别多张图片
     */
    async recognizeImages(attachments: AttachmentPayload[], additionalPrompt?: string): Promise<ImageRecognitionResult[]> {
        this.logService.info(`[ImagePreprocessing] 开始批量识别 ${attachments.length} 张图片`);

        const results: ImageRecognitionResult[] = [];

        for (const attachment of attachments) {
            try {
                const result = await this.recognizeImage(attachment, additionalPrompt);
                results.push(result);
            } catch (error) {
                this.logService.error(`[ImagePreprocessing] 识别图片失败: ${attachment.fileName}`, error);
                // 失败的图片也加入结果，但 description 包含错误信息
                results.push({
                    description: `[图片识别失败: ${attachment.fileName}]`,
                    model: 'error',
                });
            }
        }

        return results;
    }

    /**
     * 将图片识别结果转换为文本提示词
     */
    formatAsPrompt(results: ImageRecognitionResult[]): string {
        if (results.length === 0) {
            return '';
        }

        let prompt = '\n\n--- 图片附件 ---\n';

        results.forEach((result, index) => {
            prompt += `\n[图片 ${index + 1}]\n${result.description}\n`;
        });

        prompt += '--- 图片结束 ---\n\n';

        return prompt;
    }
}
