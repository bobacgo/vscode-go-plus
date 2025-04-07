import * as https from 'https'; // 添加原生https模块
import * as http from 'http'; // 添加原生http模块
import { URL } from 'url'; // 用于解析URL

export class httpClient {

    /**
     * 发送HTTP请求的辅助函数
     * Helper function to send HTTP requests
     *
     * @param url 请求URL / Request URL
     * @param options 请求选项 / Request options
     * @param data 请求数据 / Request data
     * @returns Promise<T> 响应数据 / Response data
     */
    public static async Request<T>(url: string, options: http.RequestOptions = {}, data?: any): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            // 解析URL，确定使用http还是https
            // Parse URL to determine whether to use http or https
            const parsedUrl = new URL(url);
            const httpModule = parsedUrl.protocol === 'https:' ? https : http;

            // 设置请求方法，默认GET
            // Set request method, default is GET
            options.method = options.method || 'GET';

            // 如果有data且没有设置Content-Type，设置默认值
            // If there is data and Content-Type is not set, set default value
            if (data && !options.headers?.['Content-Type']) {
                options.headers = options.headers || {};
                options.headers['Content-Type'] = 'application/json';
            }

            // 创建请求
            // Create request
            const req = httpModule.request(url, options, (res) => {
                // 响应数据缓冲区
                // Response data buffer
                let responseData = '';

                // 设置响应编码
                // Set response encoding
                res.setEncoding('utf8');

                // 接收数据
                // Receive data
                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                // 完成接收
                // Complete receiving
                res.on('end', () => {
                    // 检查状态码
                    // Check status code
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            // 尝试解析JSON
                            // Try to parse JSON
                            const parsedData = JSON.parse(responseData);
                            resolve(parsedData as T);
                        } catch (e) {
                            // 返回原始响应文本
                            // Return original response text
                            resolve(responseData as unknown as T);
                        }
                    } else {
                        // 请求失败
                        // Request failed
                        reject(new Error(`请求失败，状态码: ${res.statusCode} / Request failed with status code: ${res.statusCode}`));
                    }
                });
            });

            // 错误处理
            // Error handling
            req.on('error', (error) => {
                reject(error);
            });

            // 发送请求数据
            // Send request data
            if (data) {
                if (typeof data === 'string') {
                    req.write(data);
                } else {
                    req.write(JSON.stringify(data));
                }
            }

            // 结束请求
            // End request
            req.end();
        });
    }

    /**
     * 封装GET请求
     * Wrap GET request
     *
     * @param url 请求URL / Request URL
     * @param options 请求选项 / Request options
     * @returns Promise<T> 响应数据 / Response data
     */
    public static async Get<T>(url: string, options: http.RequestOptions = {}): Promise<T> {
        options.method = 'GET';
        return this.Request<T>(url, options);
    }

    /**
     * 封装POST请求
     * Wrap POST request
     *
     * @param url 请求URL / Request URL
     * @param data 请求数据 / Request data
     * @param options 请求选项 / Request options
     * @returns Promise<T> 响应数据 / Response data
     */
    public static async Post<T>(url: string, data: any, options: http.RequestOptions = {}): Promise<T> {
        options.method = 'POST';
        return this.Request<T>(url, options, data);
    }

    /**
     * 转换查询参数到URL字符串
     * Convert query parameters to URL string
     *
     * @param params 查询参数对象 / Query parameters object
     * @returns URL查询字符串 / URL query string
     */
    public static ObjectToQueryString(params: Record<string, any>): string {
        return Object.entries(params)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
    }

}
