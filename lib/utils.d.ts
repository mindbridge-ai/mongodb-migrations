import { MongoClient } from 'mongodb';
import * as urlBuilder from './url-builder';
export declare function _buildOptions(config: any): any;
export declare function normalizeConfig(config: urlBuilder.MongoConfig): urlBuilder.MongoConfig;
export declare function connect(config: urlBuilder.MongoConfig): Promise<MongoClient>;
export declare function repeatString(str: string, n: number): string;
