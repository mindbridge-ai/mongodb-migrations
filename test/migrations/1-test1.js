exports.id = "test1";

exports.up = async function () {
    const coll = this.db.collection("test");
    await coll.insertOne({ name: "tobi" });
};

exports.down = async function () {
    const coll = this.db.collection("test");
    await coll.deleteMany({});
};
