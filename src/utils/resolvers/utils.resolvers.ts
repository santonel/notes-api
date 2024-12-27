import type { GraphQLResolveInfo } from "graphql";
import {
	type FieldsByTypeName,
	type ResolveTree,
	parseResolveInfo,
} from "graphql-parse-resolve-info";

export interface GraphQLMappedFields {
	flatFields: string[];
	nestedFields: Record<string, GraphQLMappedFields>;
}

function isFlatField(tree: ResolveTree): boolean {
	return Object.keys(tree.fieldsByTypeName).length === 0;
}

function fetchResolveInfoNestedFields(
	resolvedInfo: ResolveTree | FieldsByTypeName,
): GraphQLMappedFields {
	const resourceTreeMap: FieldsByTypeName[keyof FieldsByTypeName] =
		Object.values(
			resolvedInfo.fieldsByTypeName,
		)[0] as FieldsByTypeName[keyof FieldsByTypeName];
	return Object.keys(resourceTreeMap).reduce<GraphQLMappedFields>(
		(map: GraphQLMappedFields, field) => {
			if (isFlatField(resourceTreeMap[field])) {
				map.flatFields.push(field);
			} else {
				map.nestedFields[field] = fetchResolveInfoNestedFields(
					resourceTreeMap[field],
				);
			}

			return map;
		},
		{ flatFields: [], nestedFields: {} },
	);
}

export function getFieldsFromResolvedInfo(
	info: GraphQLResolveInfo,
): GraphQLMappedFields {
	const resolvedInfo = parseResolveInfo(info);
	if (resolvedInfo !== null && resolvedInfo !== undefined) {
		return fetchResolveInfoNestedFields(resolvedInfo);
	}
	return { flatFields: [], nestedFields: {} };
}

export function getAllNestedKeys(
	fields: GraphQLMappedFields,
	prefix = "",
): string[] {
	const keys: string[] = [];

	for (const key of Object.keys(fields.nestedFields)) {
		const nestedField = fields.nestedFields[key];
		const nestedKeys = getAllNestedKeys(nestedField, `${prefix}${key}.`);
		keys.push(...nestedKeys);
	}

	const nestedFieldKeys = Object.keys(fields.nestedFields);
	const nestedKeysWithPrefix = nestedFieldKeys.map((key) => `${prefix}${key}`);
	keys.push(...nestedKeysWithPrefix);

	return keys;
}

export function getFlattenFields(
	fields: GraphQLMappedFields,
	prefix = "",
	rootIdFieldReplacement = "",
): string[] {
	const flattenedFields: string[] = [];

	// Add current flat fields with prefix
	flattenedFields.push(
		...fields.flatFields.map((field) => {
			const parts: string[] = prefix.split(".");

			if (parts.length > 1) {
				const currentKey = parts[parts.length - 2];

				if (field.startsWith(currentKey) && field.endsWith("Id")) {
					return `${prefix}id`;
				// biome-ignore lint/style/noUselessElse: it is needed
				} else {
					return `${prefix}${field}`;
				}
			// biome-ignore lint/style/noUselessElse: it is needed
			} else {
				if (field === rootIdFieldReplacement) {
					return "id";
				}
				return `${prefix}${field}`;
			}
		}),
	);

	// Recursively traverse nested fields
	for (const key in fields.nestedFields) {
		if (Object.prototype.hasOwnProperty.call(fields.nestedFields, key)) {
			const nestedPrefix = `${prefix + key}.`;
			flattenedFields.push(
				...getFlattenFields(fields.nestedFields[key], nestedPrefix),
			);
		}
	}

	return flattenedFields;
}
