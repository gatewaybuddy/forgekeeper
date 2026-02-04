export async function create(db, model, data, args = {}) {
    return db[model].create({ ...args, data });
}
export async function findMany(db, model, args = {}) {
    return db[model].findMany(args);
}
export async function findUnique(db, model, args) {
    return db[model].findUnique(args);
}
export async function update(db, model, args) {
    return db[model].update(args);
}
export async function updateMany(db, model, args) {
    return db[model].updateMany(args);
}
export async function upsert(db, model, args) {
    return db[model].upsert(args);
}
export async function remove(db, model, args) {
    return db[model].delete(args);
}
export async function removeMany(db, model, args) {
    return db[model].deleteMany(args);
}
