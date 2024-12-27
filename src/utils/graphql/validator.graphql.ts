import {
	type ValidationArguments,
	ValidatorConstraint,
	type ValidatorConstraintInterface,
} from "class-validator";

@ValidatorConstraint({ name: "isBefore", async: false })
export class IsBeforeConstraint implements ValidatorConstraintInterface {
	validate(propertyValue: Date, args: ValidationArguments): boolean {
		const constraintDate: Date =
			args.object[args.constraints[0] as keyof typeof args.object];
		return propertyValue < constraintDate;
	}

	defaultMessage(args: ValidationArguments): string {
		return `"${args.property}" must be before "${args.constraints[0]}"`;
	}
}
