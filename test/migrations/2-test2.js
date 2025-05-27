exports.id = "test2";

exports.up = async function () {
    const coll = this.db.collection("test");
    await coll.insertOne({ name: "loki" });
};
