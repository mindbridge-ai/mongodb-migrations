function migrationStub(id: string): string {
    return `'use strict';

module.exports.id = "${id}";

module.exports.up = async function() {
  // use this.db for MongoDB communication, and this.log() for logging
};

module.exports.down = async function() {
  // use this.db for MongoDB communication, and this.log() for logging
};`;
}

module.exports = migrationStub;