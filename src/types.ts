/**
 * 接口定义信息
 * 用于存储Go语言中接口的相关信息
 */
export interface InterfaceInfo {
    name: string;         // 接口名称
    methods: string[];    // 接口方法列表
    filePath: string;     // 接口定义的文件路径
    lineNumber: number;   // 接口定义的行号
    methodLineNumbers: Record<string, number>; // 接口方法名与行号的映射
    fullPath: string;     // 添加完整包路径
}

/**
 * 结构体实现信息
 * 用于存储结构体实现接口的信息
 */
export interface ImplementationInfo {
    structName: string;    // 结构体名称
    filePath: string;      // 结构体定义的文件路径
    lineNumber: number;    // 结构体定义的行号
}

/**
 * 方法实现信息
 * 用于存储方法实现的信息
 */
export interface MethodImplementationInfo {
    structName: string;    // 结构体名称
    filePath: string;      // 文件路径
    lineNumber: number;    // 行号
}
// 在文件顶部添加接口定义
export interface StructOption {
    label: string;
    description?: string;  // 添加可选的描述字段
    command: string;
    args: any[];
}

export interface StructField {
    name: string;
    type: string;
    isExported: boolean;  // 是否是导出字段（首字母大写）
    line: number;
}
