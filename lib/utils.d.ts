import { MongoClient } from "mongodb";
import { MongoConfig } from "./types";
export declare function _buildOptions(config: any): any;
export declare function normalizeConfig(config: MongoConfig): MongoConfig;
export declare function connect(config: MongoConfig): Promise<MongoClient>;
export declare function repeatString(str: string, n: number): string;
