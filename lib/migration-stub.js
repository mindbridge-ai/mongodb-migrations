"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrationStub = migrationStub;
function migrationStub(id) {
    return `'use strict';

module.exports.id = "${id}";

module.exports.up = async function() {
  // use this.db for MongoDB communication, and this.log() for logging
};

module.exports.down = async function() {
  // use this.db for MongoDB communication, and this.log() for logging
};`;
}
