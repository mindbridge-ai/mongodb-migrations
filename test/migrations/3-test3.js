exports.id = "test3";

exports.up = async function () {
    const coll = this.db.collection("test");
    await coll.updateMany({ name: { $in: ["loki", "tobi"] } }, { $set: { ok: 1 } });
};
