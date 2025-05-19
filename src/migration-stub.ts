function migrationStub(id: string): string {
    return `'use strict';

module.exports.id = "${id}";

module.exports.up = function (done) {
  // use this.db for MongoDB communication, and this.log() for logging
  done();
};

module.exports.down = function (done) {
  // use this.db for MongoDB communication, and this.log() for logging
  done();
};`;
}

module.exports = migrationStub;