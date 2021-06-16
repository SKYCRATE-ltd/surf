import Collection from "./collection.js";

map.forEach(([id, item]) => {
	const session = this.set(id, new Entry(item));
	console.log(  '------------------------------------------------------------ ');
	console.log(`\r 💾 LOADING SESSION                                          `);
	console.log(  '------------------------------------------------------------ ');
	console.log(  `  ID: ${session.id}`);
	console.log(  `  CREATED: ${session.createdAt.toLocaleTimeString()}`);
	console.log(  `  EXPIRES: ${session.expiresAt.toLocaleTimeString()}`);
});

console.log(`\r 📕 CREATING NEW SESSION                                     `);
console.log(  '------------------------------------------------------------ ');
console.log(  `  ID: ${id}`);
console.log(  `  CREATED: ${createdAt.toLocaleTimeString()}`);
console.log(  `  EXPIRES: ${session.expiresAt.toLocaleTimeString()}`);
console.log(  '------------------------------------------------------------ ');
if (this.has(id))
	return this.create();

const createdAt = new Date();
const session = new Entry({
	id,
	createdAt,
	updatedAt: createdAt
});

return this.set(id, this.#hooks.create?.(session) || session);

console.log(`\r ✍  UPDATING SESSION                                          `);
console.log(  '------------------------------------------------------------ ');
console.log(  `  ID: ${id}`);
console.log(  `  CREATED: ${session.createdAt.toLocaleTimeString() || 'N/A'}`);
console.log(  `  EXPIRES: ${session.expiresAt.toLocaleTimeString() || 'N/A'}`);
console.log(  '------------------------------------------------------------ ');

console.log(`\r 💥 DELETING SESSION                                         `);
console.log(  '------------------------------------------------------------ ');
console.log(  `  ID: ${id}`);
console.log(  '------------------------------------------------------------ ');

session.reset();
console.log(`\r 📖 RETRIEVING SESSION                                        `);
console.log(  '------------------------------------------------------------ ');
console.log(  `  ID: ${id}`);
console.log(  `  CREATED: ${session.createdAt.toLocaleTimeString() || 'N/A'}`);
console.log(  `  EXPIRES: ${session.expiresAt.toLocaleTimeString() || 'N/A'}`);
console.log(  '------------------------------------------------------------ ');