import {
	GraphQLMappedFields,
	getAllNestedKeys,
	getFlattenFields,
} from "../../../../src/utils/resolvers/utils.resolvers";

describe("getFlattenFields", () => {
	it("should return an empty array if no fields are provided", () => {
		const fields: GraphQLMappedFields = { flatFields: [], nestedFields: {} };
		const result = getFlattenFields(fields);
		expect(result).toEqual([]);
	});

	it("should flatten flat fields correctly", () => {
		const fields: GraphQLMappedFields = {
			flatFields: ["name", "age", "address"],
			nestedFields: {},
		};
		const result = getFlattenFields(fields);
		expect(result).toEqual(["name", "age", "address"]);
	});

	it("should flatten flat fields with prefix correctly", () => {
		const fields: GraphQLMappedFields = {
			flatFields: ["name", "age", "address"],
			nestedFields: {},
		};
		const result = getFlattenFields(fields, "user.");
		expect(result).toEqual(["user.name", "user.age", "user.address"]);
	});

	it("should flatten flat fields with prefix and rootIdFieldReplacement correctly", () => {
		const fields: GraphQLMappedFields = {
			flatFields: ["name", "age", "address"],
			nestedFields: {},
		};
		const result = getFlattenFields(fields, "user.", "userId");
		expect(result).toEqual(["user.name", "user.age", "user.address"]);
	});

	it("should flatten nested fields correctly", () => {
		const fields: GraphQLMappedFields = {
			flatFields: [],
			nestedFields: {
				contact: {
					flatFields: ["email", "phone"],
					nestedFields: {},
				},
				location: {
					flatFields: ["city", "country"],
					nestedFields: {},
				},
			},
		};
		const result = getFlattenFields(fields);
		expect(result).toEqual([
			"contact.email",
			"contact.phone",
			"location.city",
			"location.country",
		]);
	});
});

describe("getAllNestedKeys", () => {
	it("should return an empty array if no nested fields are provided", () => {
		const fields: GraphQLMappedFields = { flatFields: [], nestedFields: {} };
		const result = getAllNestedKeys(fields);
		expect(result).toEqual([]);
	});

	it("should return nested keys correctly", () => {
		const fields: GraphQLMappedFields = {
			flatFields: [],
			nestedFields: {
				contact: {
					flatFields: ["email", "phone"],
					nestedFields: {},
				},
				location: {
					flatFields: ["city", "country"],
					nestedFields: {},
				},
			},
		};
		const result = getAllNestedKeys(fields);
		expect(result).toEqual(["contact", "location"]);
	});

	it("should return nested keys with prefix correctly", () => {
		const fields: GraphQLMappedFields = {
			flatFields: [],
			nestedFields: {
				contact: {
					flatFields: ["email", "phone"],
					nestedFields: {},
				},
				location: {
					flatFields: ["city", "country"],
					nestedFields: {},
				},
			},
		};
		const result = getAllNestedKeys(fields, "user.");
		expect(result).toEqual(["user.contact", "user.location"]);
	});

	it("should return nested keys recursively", () => {
		const fields: GraphQLMappedFields = {
			flatFields: [],
			nestedFields: {
				contact: {
					flatFields: ["email", "phone"],
					nestedFields: {
						address: {
							flatFields: ["street", "zip"],
							nestedFields: {},
						},
					},
				},
			},
		};
		const result = getAllNestedKeys(fields);
		expect(result).toEqual(["contact.address", "contact"]);
	});

	it("should return nested keys recursively with prefix", () => {
		const fields: GraphQLMappedFields = {
			flatFields: [],
			nestedFields: {
				contact: {
					flatFields: ["email", "phone"],
					nestedFields: {
						address: {
							flatFields: ["street", "zip"],
							nestedFields: {},
						},
					},
				},
			},
		};
		const result = getAllNestedKeys(fields, "user.");
		expect(result).toEqual(["user.contact.address", "user.contact"]);
	});
});
