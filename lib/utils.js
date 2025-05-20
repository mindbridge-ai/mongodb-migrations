"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._buildOptions = _buildOptions;
exports.normalizeConfig = normalizeConfig;
exports.connect = connect;
exports.repeatString = repeatString;
const mongodb_1 = require("mongodb");
const urlBuilder = __importStar(require("./url-builder"));
const lodash_1 = __importDefault(require("lodash"));
const DEFAULT_POOL_SIZE = 5;
const DEFAULT_COLLECTION = '_migrations';
// This is a utility backward-compat method,
// it shouldn't be used directly
function _buildOptions(config) {
    const options = config.options || {};
    const { maxPoolSize } = config;
    if (maxPoolSize !== undefined && maxPoolSize !== null) {
        console.warn(`\n      The \`maxPoolSize\` config param is deprecated.\n      Use \`options: { maxPoolSize: maxPoolSize }\` instead.\n    `);
        if (lodash_1.default.get(options, 'server.maxPoolSize') || lodash_1.default.get(options, 'maxPoolSize')) {
            console.warn(`\n        The \`maxPoolSize\` is overriding the \`options: { maxPoolSize: maxPoolSize }\` value.\n      `);
        }
        lodash_1.default.set(options, 'maxPoolSize', maxPoolSize);
    }
    if (!lodash_1.default.get(options, 'maxPoolSize') && !lodash_1.default.get(options, 'server.maxPoolSize')) {
        lodash_1.default.set(options, 'maxPoolSize', DEFAULT_POOL_SIZE);
    }
    return options;
}
function validateConnSettings(config) {
    if (config.url)
        return;
    const { replicaset } = config;
    if (!replicaset) {
        if (!config.host) {
            throw new Error('`host` is required when `replicaset` is not set');
        }
    }
    else {
        if (!(typeof replicaset === 'object' && !Array.isArray(replicaset))) {
            throw new Error('`replicaset` is not an object');
        }
        if (!replicaset.name) {
            throw new Error('`replicaset.name` is not set');
        }
        if (!Array.isArray(replicaset.members)) {
            throw new Error('`replicaset.members` is not set or is not an array');
        }
        replicaset.members.forEach((m) => {
            if (!m?.host) {
                throw new Error('each of `replicaset.members` must have `host` set');
            }
        });
    }
    if (!config.db) {
        throw new Error('`db` is not set');
    }
    if (config.password && !config.user) {
        throw new Error('`password` provided but `user` is not');
    }
    if (config.authDatabase && !config.user) {
        throw new Error('`authDatabase` provided but `user` is not');
    }
}
function normalizeConfig(config) {
    if (!(typeof config === 'object' && !Array.isArray(config))) {
        throw new Error('`config` is not provided or is not an object');
    }
    lodash_1.default.defaults(config, { collection: DEFAULT_COLLECTION });
    validateConnSettings(config);
    return config;
}
function connect(config) {
    const options = _buildOptions(config);
    const url = urlBuilder.buildMongoConnString(config);
    return mongodb_1.MongoClient.connect(url, options);
}
function repeatString(str, n) {
    return Array(n + 1).join(str);
}
