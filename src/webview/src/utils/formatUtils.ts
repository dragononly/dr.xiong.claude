/**
 * 格式化工具 - 用于美化工具输出内容的显示
 */

/**
 * 处理字符串中的转义字符，将 \n \t \r 等转换为真正的换行/制表符
 * 同时智能处理 JSON 格式化
 */
export function unescapeString(str: string): string {
    if (!str || typeof str !== 'string') {
        return str || '';
    }

    // 替换常见的转义字符
    return str
        .replace(/\\n/g, '\n')   // 换行
        .replace(/\\t/g, '\t')   // 制表符
        .replace(/\\r/g, '\r')   // 回车
        .replace(/\\"/g, '"')    // 双引号
        .replace(/\\\\/g, '\\'); // 反斜杠
}

/**
 * 智能格式化内容
 * - 尝试解析 JSON 并格式化
 * - 处理转义字符
 * - 保持代码可读性
 */
export function formatContent(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return '';

    // 字符串处理
    if (typeof value === 'string') {
        // 尝试解析为 JSON
        try {
            const parsed = JSON.parse(value);
            return formatContent(parsed);
        } catch {
            // 不是 JSON，处理转义字符
            return unescapeString(value);
        }
    }

    // 对象/数组处理
    if (typeof value === 'object') {
        // 格式化为 JSON 字符串
        const jsonStr = JSON.stringify(value, null, 2);
        // 处理 JSON 中可能存在的转义字符（例如代码内容）
        return unescapeString(jsonStr);
    }

    // 其他类型
    return String(value);
}

/**
 * 从工具结果中提取并格式化输出内容
 * 支持多种格式：字符串、数组（content blocks）、对象
 */
export function formatToolOutput(content: unknown): string {
    if (!content) return '';

    // 字符串类型
    if (typeof content === 'string') {
        return formatContent(content);
    }

    // 数组类型 (content blocks 格式)
    if (Array.isArray(content)) {
        const textParts = content
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text);

        const combined = textParts.join('\n');

        // 尝试解析为 JSON
        try {
            const parsed = JSON.parse(combined);
            return formatContent(parsed);
        } catch {
            return unescapeString(combined);
        }
    }

    // 对象类型
    if (typeof content === 'object') {
        return formatContent(content);
    }

    return String(content);
}

/**
 * 从工具结果中提取并格式化输入参数
 */
export function formatToolInput(input: unknown): string {
    if (!input) return '';

    if (typeof input === 'object') {
        // 对于包含代码的字段（如 old_string, new_string, content），特殊处理
        const processed = processCodeFields(input as Record<string, unknown>);
        return JSON.stringify(processed, null, 2);
    }

    return formatContent(input);
}

/**
 * 处理包含代码的字段
 * 将转义的换行符转换为真正的换行，以便在显示时更易读
 */
function processCodeFields(obj: Record<string, unknown>): Record<string, unknown> {
    const codeFields = ['old_string', 'new_string', 'content', 'code', 'text', 'data'];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (codeFields.includes(key) && typeof value === 'string') {
            // 代码字段：转换转义字符
            result[key] = unescapeString(value);
        } else if (typeof value === 'object' && value !== null) {
            // 递归处理嵌套对象
            result[key] = Array.isArray(value)
                ? value.map(item =>
                    typeof item === 'object' && item !== null
                        ? processCodeFields(item as Record<string, unknown>)
                        : item
                )
                : processCodeFields(value as Record<string, unknown>);
        } else {
            result[key] = value;
        }
    }

    return result;
}

/**
 * 从错误内容中提取有意义的错误信息
 */
export function formatErrorContent(content: unknown): string {
    if (!content) return 'Unknown error';

    // 字符串类型
    if (typeof content === 'string') {
        // 尝试提取 <tool_use_error> 标签内容
        const match = content.match(/<tool_use_error>(.*?)<\/tool_use_error>/s);
        if (match) {
            return unescapeString(match[1].trim());
        }
        return unescapeString(content);
    }

    // 数组类型
    if (Array.isArray(content)) {
        return content
            .map(item => {
                if (typeof item === 'string') return unescapeString(item);
                if (item.type === 'text') return unescapeString(item.text);
                return JSON.stringify(item);
            })
            .join('\n');
    }

    // 对象类型
    if (typeof content === 'object') {
        return JSON.stringify(content, null, 2);
    }

    return String(content);
}
