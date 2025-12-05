import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as errors from "./index"
import type { WrappedError } from "./index"

describe("@superbuilders/errors", () => {
	describe("errors.new()", () => {
		it("should create a new error with the given message", () => {
			const message = "This is a new error"
			const err = errors.new(message)
			expect(err).toBeInstanceOf(Error)
			expect(err.message).toBe(message)
			expect(err.cause).toBeUndefined()
		})

		it.skip("should return a frozen (immutable) error object", () => {
			const err = errors.new("Immutable test")
			expect(Object.isFrozen(err)).toBe(true)
			// @ts-expect-error Testing immutability
			expect(() => (err.message = "new message")).toThrow()
		})

		it("should capture a stack trace", () => {
			const err = errors.new("Error with stack")
			expect(err.stack).toBeString()
			// Check if the stack trace mentions the function creating the error or the test file,
			// but not 'newError' itself ideally (depends on Error.captureStackTrace behavior)
			expect(err.stack?.includes("src/index.test.ts")).toBe(true)
		})

		it("should handle empty message string", () => {
			const err = errors.new("")
			expect(err.message).toBe("")
		})

		describe("toString()", () => {
			it("should have a working toString method for a single error", () => {
				const message = "Unique error message for newError.toString"
				const err = errors.new(message)
				expect(err.toString()).toBe(message)
			})

			it("toString() on an error from errors.new should not show 'undefined' if cause is undefined", () => {
				const err = errors.new("No explicit cause")
				expect(err.toString()).toBe("No explicit cause")
				expect(err.toString()).not.toInclude("undefined")
			})
		})
	})

	describe("errors.wrap()", () => {
		const originalMessage = "Original error for wrap"
		const originalError = errors.new(originalMessage) // Use errors.new for consistent behavior

		it("should wrap an existing error with a new message", () => {
			const wrapMessage = "Wrapper message"
			const wrappedErr = errors.wrap(originalError, wrapMessage)

			expect(wrappedErr).toBeInstanceOf(Error)
			expect(wrappedErr.message).toBe(wrapMessage)
			expect(wrappedErr.cause).toBe(originalError)
		})

		it.skip("should return a frozen (immutable) wrapped error object", () => {
			const wrappedErr = errors.wrap(originalError, "Immutable wrap test")
			expect(Object.isFrozen(wrappedErr)).toBe(true)
			// @ts-expect-error Testing immutability
			expect(() => (wrappedErr.message = "new message")).toThrow()
		})

		it("should capture a stack trace for the wrapped error", () => {
			const wrappedErr = errors.wrap(originalError, "Wrapper with stack")
			expect(wrappedErr.stack).toBeString()
			// Stack trace should point to the wrap call or the test file
			expect(wrappedErr.stack?.includes("src/index.test.ts")).toBe(true)
		})

		it("should correctly type the cause for WrappedError", () => {
			class CustomErrorForWrap extends Error {
				customField = "hello from wrap"
			}
			const customOriginal = new CustomErrorForWrap("custom original for wrap")
			const wrappedErr = errors.wrap(customOriginal, "wrapping custom for wrap")

			expect(wrappedErr.cause).toBeInstanceOf(CustomErrorForWrap)
			if (wrappedErr.cause instanceof CustomErrorForWrap) {
				expect(wrappedErr.cause.customField).toBe("hello from wrap")
			} else {
				throw errors.new("Type assertion failed for wrappedErr.cause")
			}
		})

		it("should handle empty message string for wrapper", () => {
			const wrappedErr = errors.wrap(originalError, "")
			expect(wrappedErr.message).toBe("")
			expect(wrappedErr.toString()).toBe(`: ${originalMessage}`)
		})

		describe("toString()", () => {
			it("should chain messages in toString() for one level of wrapping", () => {
				const wrapMessage = "Wrapper message for toString"
				const wrappedErr = errors.wrap(originalError, wrapMessage)
				expect(wrappedErr.toString()).toBe(`${wrapMessage}: ${originalMessage}`)
			})

			it("should handle multiple wrappings for toString()", () => {
				const wrapMessage1 = "First wrapper"
				const wrapMessage2 = "Second wrapper"
				const err1 = errors.new("Root cause for multi-wrap toString")
				const err2 = errors.wrap(err1, wrapMessage1)
				const err3 = errors.wrap(err2, wrapMessage2)
				expect(err3.toString()).toBe(`${wrapMessage2}: ${wrapMessage1}: Root cause for multi-wrap toString`)
			})

			it("toString() should handle a cause that is a standard Error without custom toString", () => {
				const plainCause = new Error("Plain cause message")
				const wrapped = errors.wrap(plainCause, "Wrapped plain cause")
				// The custom toString from errors.wrap should still chain correctly
				expect(wrapped.toString()).toBe("Wrapped plain cause: Plain cause message")
			})
		})
	})

	describe("errors.try() - async", () => {
		it("should return data on successful promise resolution", async () => {
			const data = { id: 1, name: "Test" }
			const promise = Promise.resolve(data)
			const result = await errors.try(promise)

			expect(result.data).toEqual(data)
			expect(result.error).toBeUndefined()
		})

		it("should return error on promise rejection with an Error instance", async () => {
			const errorMessage = "Async operation failed"
			const error = new Error(errorMessage) // Standard Error
			const promise = Promise.reject(error)
			const result = await errors.try(promise)

			expect(result.data).toBeUndefined()
			expect(result.error).toBeInstanceOf(Error)
			expect(result.error?.message).toBe(errorMessage)
			expect(result.error).toBe(error)
			expect(result.error?.toString()).toBe(`Error: ${errorMessage}`) // Standard Error.toString()
		})

		it("should return error (converted to Error) on promise rejection with a non-Error value", async () => {
			const rejectionValue = "Async operation failed as string"
			const promise = Promise.reject(rejectionValue)
			const result = await errors.try(promise)

			expect(result.data).toBeUndefined()
			expect(result.error).toBeInstanceOf(Error)
			expect(result.error?.message).toBe(rejectionValue)
			expect(result.error?.toString()).toBe(`Error: ${rejectionValue}`)
		})

		it("should correctly type the success value", async () => {
			const fetchData = (): Promise<{ id: number; name: string }> => Promise.resolve({ id: 123, name: "John Doe" })
			const result = await errors.try(fetchData())

			if (result.data) {
				expect(result.data.id).toBe(123)
				expect(result.data.name).toBe("John Doe")
			} else {
				throw errors.new("Test setup error: data should be defined")
			}
			expect(result.error).toBeUndefined()
		})

		it("should correctly type the error value", async () => {
			class SpecificError extends Error {
				constructor(
					message: string,
					public code: number
				) {
					super(message)
					this.name = "SpecificError"
				}
			}
			const fetchData = (): Promise<string> => Promise.reject(new SpecificError("API Error", 500))
			const result = await errors.try<string, SpecificError>(fetchData())

			if (result.error) {
				expect(result.error).toBeInstanceOf(SpecificError)
				expect(result.error.message).toBe("API Error")
				expect(result.error.code).toBe(500)
			} else {
				throw errors.new("Test setup error: error should be defined")
			}
			expect(result.data).toBeUndefined()
		})

		it("should handle promise resolving to undefined", async () => {
			const promise = Promise.resolve(undefined)
			const result = await errors.try(promise)
			expect(result.data).toBeUndefined()
			expect(result.error).toBeUndefined()
		})

		it("should handle promise resolving to null", async () => {
			const promise = Promise.resolve(null)
			const result = await errors.try(promise)
			expect(result.data).toBeNull()
			expect(result.error).toBeUndefined()
		})
	})

	describe("errors.trySync() - sync", () => {
		it("should return data on successful function execution", () => {
			const data = { id: 2, name: "Sync Test" }
			const func = () => data
			const result = errors.trySync(func)

			expect(result.data).toEqual(data)
			expect(result.error).toBeUndefined()
		})

		it("should return error when function throws an Error instance", () => {
			const errorMessage = "Sync operation failed"
			const error = new Error(errorMessage) // Standard Error
			const func = () => {
				throw error
			}
			const result = errors.trySync(func)

			expect(result.data).toBeUndefined()
			expect(result.error).toBeInstanceOf(Error)
			expect(result.error?.message).toBe(errorMessage)
			expect(result.error).toBe(error)
			expect(result.error?.toString()).toBe(`Error: ${errorMessage}`) // Standard Error.toString()
		})

		it("should return error (converted to Error) when function throws a non-Error value", () => {
			const throwValue = "Sync operation failed as string"
			const func = () => {
				throw throwValue
			}
			const result = errors.trySync(func)

			expect(result.data).toBeUndefined()
			expect(result.error).toBeInstanceOf(Error)
			expect(result.error?.message).toBe(throwValue)
			expect(result.error?.toString()).toBe(`Error: ${throwValue}`)
		})

		it("should correctly type the success value", () => {
			const processData = (): { count: number; status: string } => ({ count: 10, status: "processed" })
			const result = errors.trySync(processData)

			if (result.data) {
				expect(result.data.count).toBe(10)
				expect(result.data.status).toBe("processed")
			} else {
				throw errors.new("Test setup error: data should be defined")
			}
			expect(result.error).toBeUndefined()
		})

		it("should correctly type the error value", () => {
			class ValidationdError extends Error {
				constructor(
					message: string,
					public field: string
				) {
					super(message)
					this.name = "ValidationError"
				}
			}
			const validate = (): string => {
				throw new ValidationdError("Invalid input", "email")
			}

			const result = errors.trySync<string, ValidationdError>(validate)

			if (result.error) {
				expect(result.error).toBeInstanceOf(ValidationdError)
				expect(result.error.message).toBe("Invalid input")
				expect(result.error.field).toBe("email")
			} else {
				throw errors.new("Test setup error: error should be defined")
			}
			expect(result.data).toBeUndefined()
		})

		it("should handle function returning undefined", () => {
			const func = () => undefined
			const result = errors.trySync(func)
			expect(result.data).toBeUndefined()
			expect(result.error).toBeUndefined()
		})

		it("should handle function returning null", () => {
			const func = () => null
			const result = errors.trySync(func)
			expect(result.data).toBeNull()
			expect(result.error).toBeUndefined()
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
			expect(errors.cause(simpleError)).toBe(simpleError)
		})

		it("should return the direct cause of a singly wrapped error", () => {
			expect(errors.cause(L1Error)).toBe(rootError)
			expect(errors.cause(L1Error).message).toBe(rootCauseMsg)
		})

		it("should return the deepest cause in a chain of wrapped errors", () => {
			expect(errors.cause(L2Error)).toBe(rootError)
			expect(errors.cause(L2Error).message).toBe(rootCauseMsg)
		})

		it("should handle errors whose 'cause' property is not an Error instance", () => {
			const malformedError = new Error("Malformed") as Error & { cause: string }
			malformedError.cause = "not an error object" // Malform it
			const wrappedMalformed = errors.wrap(malformedError, "Wrapper for malformed")

			// errors.cause should stop at `malformedError` because its .cause is not an Error
			expect(errors.cause(wrappedMalformed)).toBe(malformedError)
		})

		it("should handle intermediate error with non-Error cause", () => {
			const root = errors.new("root")
			const intermediate = new Error("intermediate") as Error & { cause: string }
			intermediate.cause = "a string cause";
			// Manually create chain: top -> intermediate (with string cause) -> root
			// errors.wrap(intermediate, "top") would use intermediate.cause if it were Error
			// For this test, we need to ensure `errors.cause` stops at `intermediate`.
			// Standard `new Error("msg", {cause: nonError})` makes cause undefined.
			// So we test `errors.wrap`'s behavior when given an error whose `.cause` is bad.
			const top = errors.wrap(intermediate, "top wrapper");
			// errors.cause(top) will return `intermediate` because `intermediate.cause` is not an Error.
			expect(errors.cause(top)).toBe(intermediate)
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
			expect(deepest).toBeInstanceOf(SpecificRootError)
			expect(deepest.rootSpecificField).toBe("root_value")
		})

		it("should handle very long error chains", () => {
			let currentErr: Error = errors.new("err_0")
			for (let i = 1; i <= 100; i++) {
				currentErr = errors.wrap(currentErr, `err_${i}`)
			}
			const root = errors.cause(currentErr as WrappedError<Error>) // Cast needed due to loop
			expect(root.message).toBe("err_0")
		})
	})

	describe("errors.is()", () => {
		const e1 = errors.new("Error 1 for is")
		const e2 = errors.new("Error 2 for is")
		const e3 = errors.new("Error 3 for is")

		const wrappedE2 = errors.wrap(e2, "Wrapped E2 for is")
		const wrappedChain = errors.wrap(wrappedE2, "Chain Top for is")

		it("should return true if the error itself is the target", () => {
			expect(errors.is(e1, e1)).toBe(true)
		})

		it("should return true if an error in the chain is the target (direct cause)", () => {
			expect(errors.is(wrappedE2, e2)).toBe(true)
		})

		it("should return true if an error in the chain is the target (indirect cause)", () => {
			expect(errors.is(wrappedChain, e2)).toBe(true)
		})

		it("should return true if the target is an intermediate wrapped error in the chain", () => {
			expect(errors.is(wrappedChain, wrappedE2)).toBe(true)
		})

		it("should return false if the target is not in the chain", () => {
			expect(errors.is(wrappedChain, e1)).toBe(false)
			expect(errors.is(wrappedChain, e3)).toBe(false)
			expect(errors.is(e1, e2)).toBe(false)
		})

		it("should return false if error is undefined or null (though types should prevent this)", () => {
			// @ts-expect-error Testing invalid input
			expect(errors.is(null, e1)).toBe(false)
			// @ts-expect-error Testing invalid input
			expect(errors.is(undefined, e1)).toBe(false)
		})

		it("should return false if target is undefined or null", () => {
			// @ts-expect-error Testing invalid input
			expect(errors.is(e1, null)).toBe(false)
			// @ts-expect-error Testing invalid input
			expect(errors.is(e1, undefined)).toBe(false)
		})

		it("should handle errors whose 'cause' property is not an Error instance gracefully", () => {
			const malformedError = new Error("Malformed for is") as Error & { cause: string }
			malformedError.cause = "not an error object"
			const targetError = errors.new("Target for is")
			const wrappedMalformed = errors.wrap(malformedError, "Wrapper for malformed is")

			expect(errors.is(wrappedMalformed, malformedError)).toBe(true)
			expect(errors.is(wrappedMalformed, targetError)).toBe(false)
			// Should not find errors "beyond" the malformed cause
			const deeperError = errors.new("Deeper error")
			// @ts-expect-error Manually setting cause to test traversal stop
			malformedError.cause = deeperError // If cause was string, it would stop. If error, it continues.
			// Let's stick to the original intent: cause is not an Error instance
			malformedError.cause = "a string cause again"
			const wrappedMalformedAgain = errors.wrap(malformedError, "Wrapper 2")
			expect(errors.is(wrappedMalformedAgain, deeperError)).toBe(false) // Traversal stops at malformedError
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
			expect(errors.is(topError as WrappedError<Error>, sentinel)).toBe(true)
			expect(errors.is(topError as WrappedError<Error>, midError)).toBe(false)
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
		const wrappedStdError = errors.wrap(stdError, "Wrapped Std for as")
		const wrappedChain = errors.wrap(wrappedOne, "Chain Top for as") // CustomErrorOne is deep cause

		it("should return the error if it's an instance of the target class (itself)", () => {
			const result = errors.as(errOne, CustomErrorOne)
			expect(result).toBe(errOne)
			expect(result?.one).toBe("propertyOne")
		})

		it("should return an error in the chain if it's an instance of the target class (direct cause)", () => {
			const result = errors.as(wrappedOne, CustomErrorOne)
			expect(result).toBe(errOne)
			expect(result?.one).toBe("propertyOne")
		})

		it("should return an error in the chain if it's an instance of the target class (indirect cause)", () => {
			const result = errors.as(wrappedChain, CustomErrorOne)
			expect(result).toBe(errOne)
			expect(result?.one).toBe("propertyOne")
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
			expect(result).toBeInstanceOf(IntermediateCustomError)
			expect(result).toBe(intermediateErrorInstance)
			expect(result?.isIntermediate).toBe(true)
			expect(result?.cause).toBe(rootCauseAs)
		})

		it("should return undefined if no error in the chain is an instance of the target class", () => {
			expect(errors.as(wrappedChain, UnrelatedError)).toBeUndefined()
			expect(errors.as(errOne, CustomErrorTwo)).toBeUndefined()
			expect(errors.as(stdError, CustomErrorOne)).toBeUndefined()
		})

		it("should return undefined if error is undefined or null (though types should prevent this)", () => {
			// @ts-expect-error Testing invalid input
			expect(errors.as(null, CustomErrorOne)).toBeUndefined()
			// @ts-expect-error Testing invalid input
			expect(errors.as(undefined, CustomErrorOne)).toBeUndefined()
		})

		it("should handle errors whose 'cause' property is not an Error instance gracefully", () => {
			const malformedError = new Error("Malformed for as") as Error & { cause: string }
			malformedError.cause = "not an error object"
			const wrappedMalformed = errors.wrap(malformedError, "Wrapper for malformed as")

			expect(errors.as(wrappedMalformed, CustomErrorOne)).toBeUndefined()
			const foundStdError = errors.as(wrappedMalformed, Error) // Should find wrappedMalformed
			expect(foundStdError).toBeInstanceOf(Error)
			expect(foundStdError).toBe(wrappedMalformed) // errors.as returns the instance from the chain
		})

		it("should return the first matching error if target is general 'Error' class", () => {
			const result = errors.as(wrappedChain, Error) // wrappedChain is an Error
			expect(result).toBe(wrappedChain)
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
			expect(found).toBeInstanceOf(SentinelError)
			expect(found?.isSentinel).toBe(true)
			expect(found).toBe(sentinel)
		})
	})

	describe("Error.captureStackTrace integration", () => {
		let originalCaptureStackTrace: any

		beforeAll(() => {
			originalCaptureStackTrace = Error.captureStackTrace
		})

		afterAll(() => {
			Error.captureStackTrace = originalCaptureStackTrace
		})

		beforeEach(() => {
			if (originalCaptureStackTrace) {
				Error.captureStackTrace = spyOn(Error, "captureStackTrace")
			} else {
				Error.captureStackTrace = undefined as any
			}
		})

		it("errors.new should call Error.captureStackTrace if available and with correct arguments", () => {
			const spiedCaptureStackTrace = Error.captureStackTrace as ReturnType<typeof spyOn>
			const err = errors.new("test new stack capture")

			if (originalCaptureStackTrace) {
				expect(spiedCaptureStackTrace).toHaveBeenCalledTimes(1)
				expect(spiedCaptureStackTrace).toHaveBeenCalledWith(err, errors.new)
			} else {
				expect(Error.captureStackTrace).toBeUndefined()
			}
		})

		it("errors.wrap should call Error.captureStackTrace if available and with correct arguments", () => {
			const cause = new Error("cause") // This call will be recorded by the spy
			const spiedCaptureStackTrace = Error.captureStackTrace as ReturnType<typeof spyOn>

			if (originalCaptureStackTrace) {
				// Clear the call made by `new Error("cause")`
				// This ensures we're only asserting the call made by errors.wrap itself
				spiedCaptureStackTrace.mockClear()
			}

			const wrappedError = errors.wrap(cause, "test wrap stack capture")

			if (originalCaptureStackTrace) {
				expect(spiedCaptureStackTrace).toHaveBeenCalledTimes(1)
				expect(spiedCaptureStackTrace).toHaveBeenCalledWith(wrappedError, errors.wrap)
			} else {
				// If originalCaptureStackTrace is falsy, Error.captureStackTrace is set to undefined in beforeEach.
				// The library's `if (Error.captureStackTrace)` condition prevents the call.
				expect(Error.captureStackTrace).toBeUndefined()
			}
		})
	})
})