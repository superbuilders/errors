import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"
import type { WrappedError } from "#index.ts"
import * as errors from "#index.ts"

describe("@superbuilders/errors", () => {
	describe("errors.new()", () => {
		it("should create a new error with the given message", () => {
			const message = "This is a new error"
			const err = errors.new(message)
			assert.ok(err instanceof Error)
			assert.strictEqual(err.message, message)
			assert.strictEqual(err.cause, undefined)
		})

		it("should NOT freeze the error object (Pino must be able to serialize it)", () => {
			const err = errors.new("Mutable for serializers")
			assert.strictEqual(Object.isFrozen(err), false)
		})

		it("should capture a stack trace", () => {
			const err = errors.new("Error with stack")
			assert.strictEqual(typeof err.stack, "string")
			// Check if the stack trace mentions the function creating the error or the test file,
			// but not 'newError' itself ideally (depends on Error.captureStackTrace behavior)
			assert.strictEqual(err.stack?.includes("src/index.test.ts"), true)
		})

		it("should handle empty message string", () => {
			const err = errors.new("")
			assert.strictEqual(err.message, "")
		})

		describe("toString()", () => {
			it("should have a working toString method for a single error", () => {
				const message = "Unique error message for newError.toString"
				const err = errors.new(message)
				assert.strictEqual(err.toString(), message)
			})

			it("toString() on an error from errors.new should not show 'undefined' if cause is undefined", () => {
				const err = errors.new("No explicit cause")
				assert.strictEqual(err.toString(), "No explicit cause")
				assert.ok(!err.toString().includes("undefined"))
			})
		})
	})

	describe("errors.wrap()", () => {
		const originalMessage = "Original error for wrap"
		const originalError = errors.new(originalMessage) // Use errors.new for consistent behavior

		it("should wrap an existing error with a new message", () => {
			const wrapMessage = "Wrapper message"
			const wrappedErr = errors.wrap(originalError, wrapMessage)

			assert.ok(wrappedErr instanceof Error)
			assert.strictEqual(wrappedErr.message, wrapMessage)
			assert.strictEqual(wrappedErr.cause, originalError)
		})

		it("should NOT freeze the wrapped error object (Pino must be able to serialize it)", () => {
			const wrappedErr = errors.wrap(originalError, "Mutable wrap for serializers")
			assert.strictEqual(Object.isFrozen(wrappedErr), false)
		})

		it("should capture a stack trace for the wrapped error", () => {
			const wrappedErr = errors.wrap(originalError, "Wrapper with stack")
			assert.strictEqual(typeof wrappedErr.stack, "string")
			// Stack trace should point to the wrap call or the test file
			assert.strictEqual(wrappedErr.stack?.includes("src/index.test.ts"), true)
		})

		it("should correctly type the cause for WrappedError", () => {
			class CustomErrorForWrap extends Error {
				customField = "hello from wrap"
			}
			const customOriginal = new CustomErrorForWrap("custom original for wrap")
			const wrappedErr = errors.wrap(customOriginal, "wrapping custom for wrap")

			assert.ok(wrappedErr.cause instanceof CustomErrorForWrap)
			if (wrappedErr.cause instanceof CustomErrorForWrap) {
				assert.strictEqual(wrappedErr.cause.customField, "hello from wrap")
			} else {
				throw errors.new("Type assertion failed for wrappedErr.cause")
			}
		})

		it("should handle empty message string for wrapper", () => {
			const wrappedErr = errors.wrap(originalError, "")
			assert.strictEqual(wrappedErr.message, "")
			assert.strictEqual(wrappedErr.toString(), `: ${originalMessage}`)
		})

		describe("toString()", () => {
			it("should chain messages in toString() for one level of wrapping", () => {
				const wrapMessage = "Wrapper message for toString"
				const wrappedErr = errors.wrap(originalError, wrapMessage)
				assert.strictEqual(wrappedErr.toString(), `${wrapMessage}: ${originalMessage}`)
			})

			it("should handle multiple wrappings for toString()", () => {
				const wrapMessage1 = "First wrapper"
				const wrapMessage2 = "Second wrapper"
				const err1 = errors.new("Root cause for multi-wrap toString")
				const err2 = errors.wrap(err1, wrapMessage1)
				const err3 = errors.wrap(err2, wrapMessage2)
				assert.strictEqual(err3.toString(), `${wrapMessage2}: ${wrapMessage1}: Root cause for multi-wrap toString`)
			})

			it("toString() should handle a cause that is a standard Error without custom toString", () => {
				const plainCause = new Error("Plain cause message")
				const wrapped = errors.wrap(plainCause, "Wrapped plain cause")
				// The custom toString from errors.wrap should still chain correctly
				assert.strictEqual(wrapped.toString(), "Wrapped plain cause: Plain cause message")
			})
		})
	})

	describe("errors.try() - async", () => {
		it("should return data on successful promise resolution", async () => {
			const data = { id: 1, name: "Test" }
			const promise = Promise.resolve(data)
			const result = await errors.try(promise)

			assert.deepStrictEqual(result.data, data)
			assert.strictEqual(result.error, undefined)
		})

		it("should return error on promise rejection with an Error instance", async () => {
			const errorMessage = "Async operation failed"
			const error = new Error(errorMessage) // Standard Error
			const promise = Promise.reject(error)
			const result = await errors.try(promise)

			assert.strictEqual(result.data, undefined)
			assert.ok(result.error instanceof Error)
			assert.strictEqual(result.error?.message, errorMessage)
			assert.strictEqual(result.error, error)
			assert.strictEqual(result.error?.toString(), `Error: ${errorMessage}`) // Standard Error.toString()
		})

		it("should return error (converted to Error) on promise rejection with a non-Error value", async () => {
			const rejectionValue = "Async operation failed as string"
			const promise = Promise.reject(rejectionValue)
			const result = await errors.try(promise)

			assert.strictEqual(result.data, undefined)
			assert.ok(result.error instanceof Error)
			assert.strictEqual(result.error?.message, rejectionValue)
			assert.strictEqual(result.error?.toString(), `Error: ${rejectionValue}`)
		})

		it("should correctly type the success value", async () => {
			const fetchData = (): Promise<{ id: number; name: string }> => Promise.resolve({ id: 123, name: "John Doe" })
			const result = await errors.try(fetchData())

			if (result.data) {
				assert.strictEqual(result.data.id, 123)
				assert.strictEqual(result.data.name, "John Doe")
			} else {
				throw errors.new("Test setup error: data should be defined")
			}
			assert.strictEqual(result.error, undefined)
		})

		it("should correctly type the error value", async () => {
			class SpecificError extends Error {
				code: number
				constructor(message: string, code: number) {
					super(message)
					this.name = "SpecificError"
					this.code = code
				}
			}
			const fetchData = (): Promise<string> => Promise.reject(new SpecificError("API Error", 500))
			const result = await errors.try<string, SpecificError>(fetchData())

			if (result.error) {
				assert.ok(result.error instanceof SpecificError)
				assert.strictEqual(result.error.message, "API Error")
				assert.strictEqual(result.error.code, 500)
			} else {
				throw errors.new("Test setup error: error should be defined")
			}
			assert.strictEqual(result.data, undefined)
		})

		it("should handle promise resolving to undefined", async () => {
			const promise = Promise.resolve(undefined)
			const result = await errors.try(promise)
			assert.strictEqual(result.data, undefined)
			assert.strictEqual(result.error, undefined)
		})

		it("should handle promise resolving to null", async () => {
			const promise = Promise.resolve(null)
			const result = await errors.try(promise)
			assert.strictEqual(result.data, null)
			assert.strictEqual(result.error, undefined)
		})
	})

	describe("errors.trySync() - sync", () => {
		it("should return data on successful function execution", () => {
			const data = { id: 2, name: "Sync Test" }
			const func = () => data
			const result = errors.trySync(func)

			assert.deepStrictEqual(result.data, data)
			assert.strictEqual(result.error, undefined)
		})

		it("should return error when function throws an Error instance", () => {
			const errorMessage = "Sync operation failed"
			const error = new Error(errorMessage) // Standard Error
			const func = () => {
				throw error
			}
			const result = errors.trySync(func)

			assert.strictEqual(result.data, undefined)
			assert.ok(result.error instanceof Error)
			assert.strictEqual(result.error?.message, errorMessage)
			assert.strictEqual(result.error, error)
			assert.strictEqual(result.error?.toString(), `Error: ${errorMessage}`) // Standard Error.toString()
		})

		it("should return error (converted to Error) when function throws a non-Error value", () => {
			const throwValue = "Sync operation failed as string"
			const func = () => {
				throw throwValue
			}
			const result = errors.trySync(func)

			assert.strictEqual(result.data, undefined)
			assert.ok(result.error instanceof Error)
			assert.strictEqual(result.error?.message, throwValue)
			assert.strictEqual(result.error?.toString(), `Error: ${throwValue}`)
		})

		it("should correctly type the success value", () => {
			const processData = (): { count: number; status: string } => ({
				count: 10,
				status: "processed"
			})
			const result = errors.trySync(processData)

			if (result.data) {
				assert.strictEqual(result.data.count, 10)
				assert.strictEqual(result.data.status, "processed")
			} else {
				throw errors.new("Test setup error: data should be defined")
			}
			assert.strictEqual(result.error, undefined)
		})

		it("should correctly type the error value", () => {
			class ValidationdError extends Error {
				field: string
				constructor(message: string, field: string) {
					super(message)
					this.name = "ValidationError"
					this.field = field
				}
			}
			const validate = (): string => {
				throw new ValidationdError("Invalid input", "email")
			}

			const result = errors.trySync<string, ValidationdError>(validate)

			if (result.error) {
				assert.ok(result.error instanceof ValidationdError)
				assert.strictEqual(result.error.message, "Invalid input")
				assert.strictEqual(result.error.field, "email")
			} else {
				throw errors.new("Test setup error: error should be defined")
			}
			assert.strictEqual(result.data, undefined)
		})

		it("should handle function returning undefined", () => {
			const func = () => undefined
			const result = errors.trySync(func)
			assert.strictEqual(result.data, undefined)
			assert.strictEqual(result.error, undefined)
		})

		it("should handle function returning null", () => {
			const func = () => null
			const result = errors.trySync(func)
			assert.strictEqual(result.data, null)
			assert.strictEqual(result.error, undefined)
		})
	})

	describe("errors.cause()", () => {
		const rootCauseMsg = "Root cause of the problem"
		const rootError = errors.new(rootCauseMsg)
		const L1WrapperMsg = "Level 1 wrapper"
		const L1Error = errors.wrap(rootError, L1WrapperMsg)
		const L2WrapperMsg = "Level 2 wrapper"
		const L2Error = errors.wrap(L1Error, L2WrapperMsg)

		it("should return the error itself if it has no cause", () => {
			const simpleError = errors.new("Simple error")
			assert.strictEqual(errors.cause(simpleError), simpleError)
		})

		it("should return the direct cause of a singly wrapped error", () => {
			assert.strictEqual(errors.cause(L1Error), rootError)
			assert.strictEqual(errors.cause(L1Error).message, rootCauseMsg)
		})

		it("should return the deepest cause in a chain of wrapped errors", () => {
			assert.strictEqual(errors.cause(L2Error), rootError)
			assert.strictEqual(errors.cause(L2Error).message, rootCauseMsg)
		})

		it("should handle errors whose 'cause' property is not an Error instance", () => {
			const malformedError = new Error("Malformed") as Error & { cause: string }
			malformedError.cause = "not an error object" // Malform it
			const wrappedMalformed = errors.wrap(malformedError, "Wrapper for malformed")

			// errors.cause should stop at `malformedError` because its .cause is not an Error
			assert.strictEqual(errors.cause(wrappedMalformed), malformedError)
		})

		it("should handle intermediate error with non-Error cause", () => {
			const intermediate = new Error("intermediate") as Error & { cause: string }
			intermediate.cause = "a string cause"
			// Manually create chain: top -> intermediate (with string cause) -> root
			// errors.wrap(intermediate, "top") would use intermediate.cause if it were Error
			// For this test, we need to ensure `errors.cause` stops at `intermediate`.
			// Standard `new Error("msg", {cause: nonError})` makes cause undefined.
			// So we test `errors.wrap`'s behavior when given an error whose `.cause` is bad.
			const top = errors.wrap(intermediate, "top wrapper")
			// errors.cause(top) will return `intermediate` because `intermediate.cause` is not an Error.
			assert.strictEqual(errors.cause(top), intermediate)
		})

		it("should correctly type the deepest cause", () => {
			class SpecificRootError extends Error {
				rootSpecificField = "root_value"
				constructor(message: string) {
					super(message)
					this.name = "SpecificRootError"
				}
			}
			const specificRoot = new SpecificRootError("very specific root")
			const l1 = errors.wrap(specificRoot, "l1_wrap")
			const l2 = errors.wrap(l1, "l2_wrap")

			const deepest: SpecificRootError = errors.cause(l2)
			assert.ok(deepest instanceof SpecificRootError)
			assert.strictEqual(deepest.rootSpecificField, "root_value")
		})

		it("should handle very long error chains", () => {
			let currentErr: Error = errors.new("err_0")
			for (let i = 1; i <= 100; i++) {
				currentErr = errors.wrap(currentErr, `err_${i}`)
			}
			const root = errors.cause(currentErr as WrappedError<Error>) // Cast needed due to loop
			assert.strictEqual(root.message, "err_0")
		})
	})

	describe("errors.is()", () => {
		const e1 = errors.new("Error 1 for is")
		const e2 = errors.new("Error 2 for is")
		const e3 = errors.new("Error 3 for is")

		const wrappedE2 = errors.wrap(e2, "Wrapped E2 for is")
		const wrappedChain = errors.wrap(wrappedE2, "Chain Top for is")

		it("should return true if the error itself is the target", () => {
			assert.strictEqual(errors.is(e1, e1), true)
		})

		it("should return true if an error in the chain is the target (direct cause)", () => {
			assert.strictEqual(errors.is(wrappedE2, e2), true)
		})

		it("should return true if an error in the chain is the target (indirect cause)", () => {
			assert.strictEqual(errors.is(wrappedChain, e2), true)
		})

		it("should return true if the target is an intermediate wrapped error in the chain", () => {
			assert.strictEqual(errors.is(wrappedChain, wrappedE2), true)
		})

		it("should return false if the target is not in the chain", () => {
			assert.strictEqual(errors.is(wrappedChain, e1), false)
			assert.strictEqual(errors.is(wrappedChain, e3), false)
			assert.strictEqual(errors.is(e1, e2), false)
		})

		it("should return false if error is undefined or null (though types should prevent this)", () => {
			// @ts-expect-error Testing invalid input
			assert.strictEqual(errors.is(null, e1), false)
			// @ts-expect-error Testing invalid input
			assert.strictEqual(errors.is(undefined, e1), false)
		})

		it("should return false if target is undefined or null", () => {
			// @ts-expect-error Testing invalid input
			assert.strictEqual(errors.is(e1, null), false)
			// @ts-expect-error Testing invalid input
			assert.strictEqual(errors.is(e1, undefined), false)
		})

		it("should handle errors whose 'cause' property is not an Error instance gracefully", () => {
			const malformedError = new Error("Malformed for is") as Error & { cause: string }
			malformedError.cause = "not an error object"
			const targetError = errors.new("Target for is")
			const wrappedMalformed = errors.wrap(malformedError, "Wrapper for malformed is")

			assert.strictEqual(errors.is(wrappedMalformed, malformedError), true)
			assert.strictEqual(errors.is(wrappedMalformed, targetError), false)
			// Should not find errors "beyond" the malformed cause
			const deeperError = errors.new("Deeper error")
			malformedError.cause = "a string cause again"
			const wrappedMalformedAgain = errors.wrap(malformedError, "Wrapper 2")
			assert.strictEqual(errors.is(wrappedMalformedAgain, deeperError), false) // Traversal stops at malformedError
		})

		it("should handle very long error chains for is()", () => {
			const sentinel = errors.new("sentinel_is")
			let currentErr: Error = sentinel
			for (let i = 1; i <= 50; i++) {
				currentErr = errors.wrap(currentErr, `wrap_is_${i}`)
			}
			const midError = errors.new("mid_is")
			currentErr = errors.wrap(currentErr, "mid_wrapper_is")
			currentErr = errors.wrap(midError, currentErr.message) // midError is not in the chain of sentinel
			let topError: Error = sentinel
			for (let i = 1; i <= 50; i++) {
				topError = errors.wrap(topError, `wrap_top_is_${i}`)
			}
			assert.strictEqual(errors.is(topError as WrappedError<Error>, sentinel), true)
			assert.strictEqual(errors.is(topError as WrappedError<Error>, midError), false)
		})
	})

	describe("errors.as()", () => {
		class CustomErrorOne extends Error {
			one = "propertyOne"
			constructor(message: string) {
				super(message)
				this.name = "CustomErrorOne"
			}
		}
		class CustomErrorTwo extends Error {
			two = "propertyTwo"
			constructor(message: string) {
				super(message)
				this.name = "CustomErrorTwo"
			}
		}
		class UnrelatedError extends Error {
			constructor(message: string) {
				super(message)
				this.name = "UnrelatedError"
			}
		}

		const errOne = new CustomErrorOne("Instance of One for as")
		const stdError = new Error("Standard Error for as")

		const wrappedOne = errors.wrap(errOne, "Wrapped One for as")
		const wrappedChain = errors.wrap(wrappedOne, "Chain Top for as") // CustomErrorOne is deep cause

		it("should return the error if it's an instance of the target class (itself)", () => {
			const result = errors.as(errOne, CustomErrorOne)
			assert.strictEqual(result, errOne)
			assert.strictEqual(result?.one, "propertyOne")
		})

		it("should return an error in the chain if it's an instance of the target class (direct cause)", () => {
			const result = errors.as(wrappedOne, CustomErrorOne)
			assert.strictEqual(result, errOne)
			assert.strictEqual(result?.one, "propertyOne")
		})

		it("should return an error in the chain if it's an instance of the target class (indirect cause)", () => {
			const result = errors.as(wrappedChain, CustomErrorOne)
			assert.strictEqual(result, errOne)
			assert.strictEqual(result?.one, "propertyOne")
		})

		it("should return an intermediate error if it matches its specific class in the chain", () => {
			class IntermediateCustomError extends Error {
				isIntermediate = true
				constructor(message: string, originalCause?: Error) {
					super(message, { cause: originalCause })
					this.name = "IntermediateCustomError"
				}
			}
			const rootCauseAs = errors.new("Root cause error for as_intermediate")
			const intermediateErrorInstance = new IntermediateCustomError("This is intermediate for as", rootCauseAs)
			const topLevelErrorAs = errors.wrap(intermediateErrorInstance, "Top-level wrapper for as_intermediate")

			const result = errors.as(topLevelErrorAs, IntermediateCustomError)
			assert.ok(result instanceof IntermediateCustomError)
			assert.strictEqual(result, intermediateErrorInstance)
			assert.strictEqual(result?.isIntermediate, true)
			assert.strictEqual(result?.cause, rootCauseAs)
		})

		it("should return undefined if no error in the chain is an instance of the target class", () => {
			assert.strictEqual(errors.as(wrappedChain, UnrelatedError), undefined)
			assert.strictEqual(errors.as(errOne, CustomErrorTwo), undefined)
			assert.strictEqual(errors.as(stdError, CustomErrorOne), undefined)
		})

		it("should return undefined if error is undefined or null (though types should prevent this)", () => {
			// @ts-expect-error Testing invalid input
			assert.strictEqual(errors.as(null, CustomErrorOne), undefined)
			// @ts-expect-error Testing invalid input
			assert.strictEqual(errors.as(undefined, CustomErrorOne), undefined)
		})

		it("should handle errors whose 'cause' property is not an Error instance gracefully", () => {
			const malformedError = new Error("Malformed for as") as Error & { cause: string }
			malformedError.cause = "not an error object"
			const wrappedMalformed = errors.wrap(malformedError, "Wrapper for malformed as")

			assert.strictEqual(errors.as(wrappedMalformed, CustomErrorOne), undefined)
			const foundStdError = errors.as(wrappedMalformed, Error) // Should find wrappedMalformed
			assert.ok(foundStdError instanceof Error)
			assert.strictEqual(foundStdError, wrappedMalformed) // errors.as returns the instance from the chain
		})

		it("should return the first matching error if target is general 'Error' class", () => {
			const result = errors.as(wrappedChain, Error) // wrappedChain is an Error
			assert.strictEqual(result, wrappedChain)
		})

		it("should handle very long error chains for as()", () => {
			class SentinelError extends Error {
				isSentinel = true
				constructor() {
					super("sentinel_as")
					this.name = "SentinelError"
				}
			}
			const sentinel = new SentinelError()
			let currentErr: Error = sentinel
			for (let i = 1; i <= 100; i++) {
				currentErr = errors.wrap(currentErr, `wrap_as_${i}`)
			}
			const found = errors.as(currentErr as WrappedError<Error>, SentinelError)
			assert.ok(found instanceof SentinelError)
			assert.strictEqual(found?.isSentinel, true)
			assert.strictEqual(found, sentinel)
		})
	})

	describe("Error.captureStackTrace integration", () => {
		it("errors.new should call Error.captureStackTrace with correct arguments", () => {
			const spy = mock.method(Error, "captureStackTrace")
			const err = errors.new("test new stack capture")

			assert.strictEqual(spy.mock.callCount(), 1)
			const call = spy.mock.calls[0]
			assert.ok(call)
			assert.strictEqual(call.arguments[0], err)
			assert.strictEqual(call.arguments[1], errors.new)
			spy.mock.restore()
		})

		it("errors.wrap should call Error.captureStackTrace with correct arguments", () => {
			const cause = new Error("cause")
			const spy = mock.method(Error, "captureStackTrace")

			const wrappedError = errors.wrap(cause, "test wrap stack capture")

			assert.strictEqual(spy.mock.callCount(), 1)
			const call = spy.mock.calls[0]
			assert.ok(call)
			assert.strictEqual(call.arguments[0], wrappedError)
			assert.strictEqual(call.arguments[1], errors.wrap)
			spy.mock.restore()
		})
	})
})
