type Success<T> = {
	data: T
	error: undefined
}

type Failure<E extends Error> = {
	data: undefined
	error: E
}

type Result<T, E extends Error = Error> = Success<T> | Failure<E>

/**
 * Represents an error that wraps another error, establishing a cause chain.
 * @template C The type of the direct cause of this error.
 */
export interface WrappedError<C extends Error> extends Error {
	readonly cause: C
}

/**
 * Recursively unwraps `WrappedError` types to find the type of the ultimate underlying cause.
 * If the error is not a `WrappedError` or the chain ends, it returns the type of that error.
 *
 * @example
 * type T0 = DeepestCause<WrappedError<Error>>; // Error
 * type T1 = DeepestCause<WrappedError<TypeError>>; // TypeError
 * type T2 = DeepestCause<WrappedError<WrappedError<SyntaxError>>>; // SyntaxError
 * type T3 = DeepestCause<RangeError>; // RangeError
 */
export type DeepestCause<E extends Error> = E extends WrappedError<infer NextCause> ? DeepestCause<NextCause> : E

function createErrorChainToString(this: Error): string {
	const messages: string[] = []
	let currentError: Error | undefined = this
	while (currentError != undefined) {
		messages.push(currentError.message)
		// Check for a 'cause' property that is an instance of Error
		if (currentError.cause instanceof Error) {
			currentError = currentError.cause
		} else {
			break
		}
	}

	return messages.join(": ")
}

function createPlainObjectFromError(err: Error): Record<string, unknown> {
	return createErrorToJSON.call(err)
}

function createErrorToJSON(this: Error): Record<string, unknown> {
	const json: Record<string, unknown> = {
		name: this.name,
		message: this.message,
		stack: this.stack
	}

	const anyErr = this as any
	if (anyErr.cause instanceof Error) {
		json.cause = createPlainObjectFromError(anyErr.cause)
	} else if ("cause" in anyErr && anyErr.cause !== undefined) {
		json.cause = anyErr.cause
	}

	for (const key of Object.keys(this)) {
		if (!(key in json)) {
			json[key] = (this as any)[key]
		}
	}

	return json
}

function newError(message: string): Readonly<Error> {
	const e = new Error(message)
	if (Error.captureStackTrace) {
		Error.captureStackTrace(e, newError)
	}

	e.toString = createErrorChainToString
	;(e as any).toJSON = createErrorToJSON
	return e
}

function wrap<E extends Error>(originalError: E, message: string): Readonly<WrappedError<E>> {
	// Modern environments support { cause: error } in Error constructor
	const newErrorInstance = new Error(message, { cause: originalError })

	// Ensure the instance structurally matches WrappedError<E>
	// This cast is safe because we've explicitly set the cause.
	const wrapped = newErrorInstance as WrappedError<E>

	if (Error.captureStackTrace) {
		Error.captureStackTrace(wrapped, wrap)
	}

	wrapped.toString = createErrorChainToString
	;(wrapped as any).toJSON = createErrorToJSON
	return wrapped
}

/**
 * Returns the underlying cause of the error.
 * It traverses the error chain by accessing the `cause` property of each error,
 * returning the first error in the chain that does not have a further `cause`
 * that is an `Error` instance, or the error itself if it has no cause.
 *
 * If `error` is a `WrappedError<T>`, the return type will be the `DeepestCause<T>`,
 * providing a precise type for the root cause.
 * For other error types, it returns `Error`.
 */
function cause<T extends Error>(error: WrappedError<T>): DeepestCause<T>
function cause<T extends Error>(error: T): Error // Fallback for general errors
function cause<T extends Error>(error: T): Error {
	let result: Error = error
	while (result.cause instanceof Error) {
		result = result.cause
	}
	// The implementation returns the most specific runtime error found.
	// The overloads provide compile-time type information.
	// The cast to `DeepestCause<T>` or `Error` is handled by TypeScript's overload resolution.
	return result
}

/**
 * Reports whether any error in err's chain matches target.
 * The chain consists of err itself followed by the sequence of errors
 * obtained by repeatedly accessing the `cause` property.
 * An error is considered a match if it is identical (===) to target.
 */
function isError<T extends Error>(err: WrappedError<T>, target: T): boolean
function isError<T extends Error, U extends Error>(err: WrappedError<T>, target: U): boolean
function isError<T extends Error, U extends Error>(err: T, target: U): boolean
function isError<T extends Error, U extends Error>(err: T, target: U): boolean {
	let currentError: Error | undefined = err
	while (currentError != undefined) {
		if (currentError === target) {
			return true
		}
		if (currentError.cause instanceof Error) {
			currentError = currentError.cause
		} else {
			break
		}
	}

	return false
}

/**
 * Returns the first error in err's chain that matches `ErrorClass`.
 * The chain consists of err itself followed by the sequence of errors
 * obtained by repeatedly accessing the `cause` property.
 */
function asError<T extends Error, U extends Error>(
	err: WrappedError<T>,
	ErrorClass: new (...args: any[]) => U
): U | undefined
function asError<T extends Error, U extends Error>(err: T, ErrorClass: new (...args: any[]) => U): U | undefined
function asError<T extends Error, U extends Error>(err: T, ErrorClass: new (...args: any[]) => U): U | undefined {
	let currentError: Error | undefined = err
	while (currentError != undefined) {
		if (currentError instanceof ErrorClass) {
			return currentError as U
		}
		if (currentError.cause instanceof Error) {
			currentError = currentError.cause
		} else {
			break
		}
	}

	return undefined
}

/**
 * Wraps a Promise to return a Result object, discriminating between success (data) and failure (error).
 * If the promise rejects, the caught error is cast to type E.
 */
async function tryCatch<T, E extends Error = Error>(promise: Promise<T>): Promise<Result<T, E>> {
	try {
		const data = await promise
		return { data, error: undefined }
	} catch (error) {
		// Ensure the caught value is at least an Error instance before casting to E
		const finalError = (error instanceof Error ? error : new Error(String(error))) as E
		return { data: undefined, error: finalError }
	}
}

/**
 * Wraps a synchronous function to return a Result object, discriminating between success (data) and failure (error).
 * If the function throws, the caught error is cast to type E.
 */
function trySync<T, E extends Error = Error>(fn: () => T): Result<T, E> {
	try {
		const data = fn()
		return { data, error: undefined }
	} catch (error) {
		// Ensure the caught value is at least an Error instance before casting to E
		const finalError = (error instanceof Error ? error : new Error(String(error))) as E
		return { data: undefined, error: finalError }
	}
}

export { asError as as, cause, isError as is, newError as new, tryCatch as try, trySync, wrap }

