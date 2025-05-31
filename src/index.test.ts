import { expect, describe, it, spyOn, beforeAll, afterAll, beforeEach } from "bun:test";
import * as errors from "./index";

describe("@superbuilders/errors", () => {
	describe("errors.new()", () => {
		it("should create a new error with the given message", () => {
			const message = "This is a new error";
			const err = errors.new(message);
			expect(err).toBeInstanceOf(Error);
			expect(err.message).toBe(message);
		});

		it("should have a working toString method for a single error", () => {
			const message = "Unique error message";
			const err = errors.new(message);
			expect(err.toString()).toBe(message);
		});

		it("should return a frozen (immutable) error object", () => {
			const err = errors.new("Immutable test");
			expect(Object.isFrozen(err)).toBe(true);
		});

		it("should capture a stack trace", () => {
			const err = errors.new("Error with stack");
			expect(err.stack).toBeString();
			// Check if the stack trace mentions 'newError' (internal name of errors.new) or the current test file
			expect(err.stack?.includes("newError") || err.stack?.includes("src/index.test.ts")).toBe(true);
		});
	});

	describe("errors.wrap()", () => {
		const originalMessage = "Original error";
		const originalError = new Error(originalMessage); // Using a standard error as cause

		it("should wrap an existing error with a new message", () => {
			const wrapMessage = "Wrapper message";
			const wrappedErr = errors.wrap(originalError, wrapMessage);

			expect(wrappedErr).toBeInstanceOf(Error);
			expect(wrappedErr.message).toBe(wrapMessage);
			expect(wrappedErr.cause).toBe(originalError);
		});

		it("should chain messages in toString()", () => {
			const wrapMessage = "Wrapper message";
			const wrappedErr = errors.wrap(originalError, wrapMessage);
			expect(wrappedErr.toString()).toBe(`${wrapMessage}: ${originalMessage}`);
		});

		it("should handle multiple wrappings for toString()", () => {
			const wrapMessage1 = "First wrapper";
			const wrapMessage2 = "Second wrapper";
			const err1 = errors.new("Root cause");
			const err2 = errors.wrap(err1, wrapMessage1);
			const err3 = errors.wrap(err2, wrapMessage2);
			expect(err3.toString()).toBe(`${wrapMessage2}: ${wrapMessage1}: Root cause`);
		});

		it("should return a frozen (immutable) wrapped error object", () => {
			const wrappedErr = errors.wrap(originalError, "Immutable wrap test");
			expect(Object.isFrozen(wrappedErr)).toBe(true);
		});

		it("should correctly type the cause for WrappedError", () => {
			class CustomError extends Error {
				customField = "hello";
			}
			const customOriginal = new CustomError("custom original");
			const wrappedErr = errors.wrap(customOriginal, "wrapping custom");

			// Type assertion to check if TypeScript understands the cause type
			if (wrappedErr.cause instanceof CustomError) {
				expect(wrappedErr.cause.customField).toBe("hello");
			} else {
				// This block should not be reached if typing is correct
				expect(true).toBe(false); // Force failure
			}
		});
	});

	describe("errors.try() - async", () => {
		it("should return data on successful promise resolution", async () => {
			const data = { id: 1, name: "Test" };
			const promise = Promise.resolve(data);
			const result = await errors.try(promise);

			expect(result.data).toEqual(data);
			expect(result.error).toBeUndefined();
		});

		it("should return error on promise rejection with an Error instance", async () => {
			const errorMessage = "Async operation failed";
			const error = new Error(errorMessage);
			const promise = Promise.reject(error);
			const result = await errors.try(promise);

			expect(result.data).toBeUndefined();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe(errorMessage);
			expect(result.error).toBe(error); // Should be the same error instance
		});

		it("should return error (converted to Error) on promise rejection with a non-Error value", async () => {
			const rejectionValue = "Async operation failed as string";
			const promise = Promise.reject(rejectionValue);
			const result = await errors.try(promise);

			expect(result.data).toBeUndefined();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe(rejectionValue);
		});

		it("should correctly type the success value", async () => {
			const fetchData = (): Promise<{ id: number; name: string }> =>
				Promise.resolve({ id: 123, name: "John Doe" });
			const result = await errors.try(fetchData());

			if (result.data) {
				expect(result.data.id).toBe(123);
				expect(result.data.name).toBe("John Doe");
			} else {
				expect(true).toBe(false); // Should not reach here
			}
			expect(result.error).toBeUndefined();
		});

		it("should correctly type the error value", async () => {
			class SpecificError extends Error {
				constructor(message: string, public code: number) {
					super(message);
					this.name = "SpecificError";
				}
			}
			const fetchData = (): Promise<string> => Promise.reject(new SpecificError("API Error", 500));

			// Specify the error type for errors.try
			const result = await errors.try<string, SpecificError>(fetchData());

			if (result.error) {
				expect(result.error).toBeInstanceOf(SpecificError);
				expect(result.error.message).toBe("API Error");
				expect(result.error.code).toBe(500);
			} else {
				expect(true).toBe(false); // Should not reach here
			}
			expect(result.data).toBeUndefined();
		});
	});

	describe("errors.trySync() - sync", () => {
		it("should return data on successful function execution", () => {
			const data = { id: 2, name: "Sync Test" };
			const func = () => data;
			const result = errors.trySync(func);

			expect(result.data).toEqual(data);
			expect(result.error).toBeUndefined();
		});

		it("should return error when function throws an Error instance", () => {
			const errorMessage = "Sync operation failed";
			const error = new Error(errorMessage);
			const func = () => {
				throw error;
			};
			const result = errors.trySync(func);

			expect(result.data).toBeUndefined();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe(errorMessage);
			expect(result.error).toBe(error); // Should be the same error instance
		});

		it("should return error (converted to Error) when function throws a non-Error value", () => {
			const throwValue = "Sync operation failed as string";
			const func = () => {
				throw throwValue;
			};
			const result = errors.trySync(func);

			expect(result.data).toBeUndefined();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe(throwValue);
		});

		it("should correctly type the success value", () => {
			const processData = (): { count: number; status: string } => ({ count: 10, status: "processed" });
			const result = errors.trySync(processData);

			if (result.data) {
				expect(result.data.count).toBe(10);
				expect(result.data.status).toBe("processed");
			} else {
				expect(true).toBe(false); // Should not reach here
			}
			expect(result.error).toBeUndefined();
		});

		it("should correctly type the error value", () => {
			class ValidationdError extends Error {
				constructor(message: string, public field: string) {
					super(message);
					this.name = "ValidationError";
				}
			}
			const validate = (): string => { throw new ValidationdError("Invalid input", "email"); };

			const result = errors.trySync<string, ValidationdError>(validate);

			if (result.error) {
				expect(result.error).toBeInstanceOf(ValidationdError);
				expect(result.error.message).toBe("Invalid input");
				expect(result.error.field).toBe("email");
			} else {
				expect(true).toBe(false); // Should not reach here
			}
			expect(result.data).toBeUndefined();
		});
	});

	describe("errors.cause()", () => {
		const rootCauseMsg = "Root cause of the problem";
		const rootError = errors.new(rootCauseMsg);
		const L1WrapperMsg = "Level 1 wrapper";
		const L1Error = errors.wrap(rootError, L1WrapperMsg);
		const L2WrapperMsg = "Level 2 wrapper";
		const L2Error = errors.wrap(L1Error, L2WrapperMsg);

		it("should return the error itself if it has no cause", () => {
			const simpleError = errors.new("Simple error");
			expect(errors.cause(simpleError)).toBe(simpleError);
		});

		it("should return the direct cause of a singly wrapped error", () => {
			expect(errors.cause(L1Error)).toBe(rootError);
			expect(errors.cause(L1Error).message).toBe(rootCauseMsg);
		});

		it("should return the deepest cause in a chain of wrapped errors", () => {
			expect(errors.cause(L2Error)).toBe(rootError);
			expect(errors.cause(L2Error).message).toBe(rootCauseMsg);
		});

		it("should handle errors whose 'cause' property is not an Error instance", () => {
			const malformedError = new Error("Malformed") as any;
			malformedError.cause = "not an error object"; // Malform it
			const wrappedMalformed = errors.wrap(malformedError as Error, "Wrapper for malformed");
			// errors.cause should stop at `malformedError` because its .cause is not an Error
			expect(errors.cause(wrappedMalformed)).toBe(malformedError);
		});

		it("should correctly type the deepest cause", () => {
			class SpecificRootError extends Error {
				rootSpecificField = "root_value";
				constructor(message: string) {
					super(message);
					this.name = "SpecificRootError";
				}
			}
			const specificRoot = new SpecificRootError("very specific root");
			const l1 = errors.wrap(specificRoot, "l1_wrap");
			const l2 = errors.wrap(l1, "l2_wrap");

			const deepest: SpecificRootError = errors.cause(l2); // Type should be SpecificRootError
			expect(deepest).toBeInstanceOf(SpecificRootError);
			expect(deepest.rootSpecificField).toBe("root_value");
		});
	});

	describe("errors.is()", () => {
		const e1 = errors.new("Error 1");
		const e2 = errors.new("Error 2");
		const e3 = errors.new("Error 3");

		const wrappedE2 = errors.wrap(e2, "Wrapped E2"); // e2 is cause
		const wrappedChain = errors.wrap(wrappedE2, "Chain Top"); // wrappedE2 is cause, e2 is cause of wrappedE2

		it("should return true if the error itself is the target", () => {
			expect(errors.is(e1, e1)).toBe(true);
		});

		it("should return true if an error in the chain is the target (direct cause)", () => {
			expect(errors.is(wrappedE2, e2)).toBe(true);
		});

		it("should return true if an error in the chain is the target (indirect cause)", () => {
			expect(errors.is(wrappedChain, e2)).toBe(true);
		});

		it("should return true if the target is an intermediate wrapped error in the chain", () => {
			expect(errors.is(wrappedChain, wrappedE2)).toBe(true);
		});

		it("should return false if the target is not in the chain", () => {
			expect(errors.is(wrappedChain, e1)).toBe(false);
			expect(errors.is(wrappedChain, e3)).toBe(false);
			expect(errors.is(e1, e2)).toBe(false);
		});

		it("should return false if error is undefined or null (though types should prevent this)", () => {
			// @ts-expect-error Testing invalid input
			expect(errors.is(null, e1)).toBe(false);
			// @ts-expect-error Testing invalid input
			expect(errors.is(undefined, e1)).toBe(false);
		});

		it("should handle errors whose 'cause' property is not an Error instance gracefully", () => {
			const malformedError = new Error("Malformed") as any;
			malformedError.cause = "not an error object";
			const targetError = errors.new("Target");
			const wrappedMalformed = errors.wrap(malformedError as Error, "Wrapper for malformed");

			expect(errors.is(wrappedMalformed, malformedError as Error)).toBe(true);
			expect(errors.is(wrappedMalformed, targetError)).toBe(false);
		});
	});

	describe("errors.as()", () => {
		class CustomErrorOne extends Error {
			one = "propertyOne";
			constructor(message: string) {
				super(message);
				this.name = "CustomErrorOne";
			}
		}
		class CustomErrorTwo extends Error {
			two = "propertyTwo";
			constructor(message: string) {
				super(message);
				this.name = "CustomErrorTwo";
			}
		}
		class UnrelatedError extends Error {
			constructor(message: string) {
				super(message);
				this.name = "UnrelatedError";
			}
		}

		const errOne = new CustomErrorOne("Instance of One");
		const stdError = new Error("Standard Error");

		const wrappedOne = errors.wrap(errOne, "Wrapped One"); // errOne is cause
		const wrappedTwoOverOne = errors.wrap(wrappedOne, "Wrapped Two over One"); // wrappedOne is cause

		it("should return the error if it's an instance of the target class (itself)", () => {
			const result = errors.as(errOne, CustomErrorOne);
			expect(result).toBe(errOne);
			expect(result?.one).toBe("propertyOne");
		});

		it("should return an error in the chain if it's an instance of the target class (direct cause)", () => {
			const result = errors.as(wrappedOne, CustomErrorOne);
			expect(result).toBe(errOne);
			expect(result?.one).toBe("propertyOne");
		});

		it("should return an error in the chain if it's an instance of the target class (indirect cause)", () => {
			const result = errors.as(wrappedTwoOverOne, CustomErrorOne);
			expect(result).toBe(errOne);
			expect(result?.one).toBe("propertyOne");
		});

		// MODIFIED TEST CASE
		it("should return an intermediate error if it matches its specific class in the chain", () => {
			class IntermediateCustomError extends Error {
				isIntermediate = true;
				constructor(message: string, originalCause: Error) {
					super(message, { cause: originalCause }); // Standard way to set cause
					this.name = "IntermediateCustomError";
				}
			}

			const rootCause = errors.new("Root cause error");
			// Create an instance of IntermediateCustomError that itself has a cause
			const intermediateErrorInstance = new IntermediateCustomError("This is the intermediate custom error", rootCause);
			// Wrap this intermediate custom error with a standard errors.wrap
			const topLevelError = errors.wrap(intermediateErrorInstance, "Top-level wrapper");

			// Chain: topLevelError (Error) -> intermediateErrorInstance (IntermediateCustomError) -> rootCause (Error)

			// Attempt to find the IntermediateCustomError instance in the chain starting from topLevelError
			const result = errors.as(topLevelError, IntermediateCustomError);

			expect(result).toBeInstanceOf(IntermediateCustomError);
			expect(result).toBe(intermediateErrorInstance); // Should be the exact instance
			if (result) { // Type guard
				expect(result.isIntermediate).toBe(true);
				// Check that 'cause' was correctly passed and retained by IntermediateCustomError's constructor
				// and is accessible via the 'cause' property that errors.as() would traverse
				const causeOfIntermediate = result.cause;
				expect(causeOfIntermediate).toBe(rootCause);
			} else {
				expect(true).toBe(false); // Force fail if result is null/undefined
			}
		});

		it("should return undefined if no error in the chain is an instance of the target class", () => {
			expect(errors.as(wrappedTwoOverOne, UnrelatedError)).toBeUndefined();
			expect(errors.as(errOne, CustomErrorTwo)).toBeUndefined();
			expect(errors.as(stdError, CustomErrorOne)).toBeUndefined();
		});

		it("should return undefined if error is undefined or null (though types should prevent this)", () => {
			// @ts-expect-error Testing invalid input
			expect(errors.as(null, CustomErrorOne)).toBeUndefined();
			// @ts-expect-error Testing invalid input
			expect(errors.as(undefined, CustomErrorOne)).toBeUndefined();
		});

		it("should handle errors whose 'cause' property is not an Error instance gracefully", () => {
			const malformedError = new Error("Malformed") as any;
			malformedError.cause = "not an error object";
			const wrappedMalformed = errors.wrap(malformedError as Error, "Wrapper for malformed");

			expect(errors.as(wrappedMalformed, CustomErrorOne)).toBeUndefined(); // CustomErrorOne is not in chain
			const foundStdError = errors.as(wrappedMalformed, Error); // Should find wrappedMalformed (or malformedError if wrap changes it)
			expect(foundStdError).toBeInstanceOf(Error);
			// Depending on how wrap handles a malformed cause, foundStdError could be wrappedMalformed or malformedError.
			// If it's wrappedMalformed, then foundStdError.cause would be malformedError.
			// If errors.wrap "fixes" the cause to be undefined because it's not an Error, then it would be wrappedMalformed.
			// The current errors.wrap implementation preserves the cause as-is. errors.as will stop traversal if cause is not Error.
			// So foundStdError should be wrappedMalformed.
			expect(foundStdError).toBe(wrappedMalformed);
		});
	});

	describe("Error.captureStackTrace integration", () => {
		// Store original Error.captureStackTrace and restore it to avoid interference between tests
		let originalCaptureStackTrace: any;

		beforeAll(() => {
			originalCaptureStackTrace = Error.captureStackTrace;
		});

		afterAll(() => {
			Error.captureStackTrace = originalCaptureStackTrace;
		});

		// Reset the spy for each test within this describe block if Error.captureStackTrace exists
		beforeEach(() => {
			if (originalCaptureStackTrace) {
				Error.captureStackTrace = spyOn(Error, 'captureStackTrace');
			} else {
				Error.captureStackTrace = undefined as any; // Ensure it's undefined if not supported
			}
		});


		it("errors.new should call Error.captureStackTrace if available", () => {
			errors.new("test stack capture");
			if (originalCaptureStackTrace) { // Only expect call if it was originally there
				expect(Error.captureStackTrace).toHaveBeenCalledTimes(1);
			} else {
				expect(Error.captureStackTrace).toBeUndefined();
			}
		});

		it("errors.wrap should call Error.captureStackTrace if available", () => {
			const cause = new Error("cause");
			errors.wrap(cause, "test wrap stack capture");
			if (originalCaptureStackTrace) {
				expect(Error.captureStackTrace).toHaveBeenCalledTimes(1);
			} else {
				expect(Error.captureStackTrace).toBeUndefined();
			}
		});
	});
});