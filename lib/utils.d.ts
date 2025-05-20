import { MongoClient } from 'mongodb';
export declare function _buildOptions(config: any): any;
export declare function normalizeConfig(config: any): any;
export declare function connect(config: any): Promise<MongoClient>;
export declare function repeatString(str: string, n: number): string;
