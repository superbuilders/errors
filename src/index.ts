type Success<T> = {
	data: T
	error: undefined
}

type Failure<E extends Error> = {
	data: undefined
	error: E
}

/**
 * Discriminated success/failure pair returned by `errors.try` and
 * `errors.trySync`. Check `result.error` first; the branches are mutually
 * exclusive.
 */
export type Result<T, E extends Error = Error> = Success<T> | Failure<E>

/**
 * Renders the full message chain, joining each error's message with its
 * cause's, exactly like the Go original's Error(): "outer: inner: root".
 */
function createErrorChainToString(this: Error): string {
	const messages: string[] = []
	let currentError: Error | undefined = this
	while (currentError !== undefined) {
		messages.push(currentError.message)
		if (currentError.cause instanceof Error) {
			currentError = currentError.cause
		} else {
			break
		}
	}

	return messages.join(": ")
}

/**
 * Structured serialization for JSON.stringify and structured loggers: name,
 * message, stack, a recursively serialized cause, and every enumerable own
 * property the error carries. The serializers themselves are installed
 * non-enumerably, so they never appear in this output.
 */
function createErrorToJSON(this: Error): Record<string, unknown> {
	const json: Record<string, unknown> = {
		name: this.name,
		message: this.message,
		stack: this.stack
	}

	if (this.cause instanceof Error) {
		json.cause = createErrorToJSON.call(this.cause)
	} else if (this.cause !== undefined) {
		json.cause = this.cause
	}

	for (const [key, value] of Object.entries(this)) {
		if (!(key in json)) {
			json[key] = value
		}
	}

	return json
}

/**
 * Installs the chain-aware toString and the structured toJSON as
 * NON-ENUMERABLE own properties. Plain assignment would create enumerable
 * properties that leak into Object.keys, spreads, and serialized payloads —
 * the source of `toString: [Function]` noise in logged errors.
 */
function installSerializers(e: Error): void {
	Object.defineProperty(e, "toString", {
		value: createErrorChainToString,
		writable: true,
		configurable: true
	})
	Object.defineProperty(e, "toJSON", {
		value: createErrorToJSON,
		writable: true,
		configurable: true
	})
}

/**
 * Returns a new error with the given message and a stack trace trimmed to
 * the caller. Modeled on efficientgo/core's errors.New.
 */
function newError(message: string): Error {
	const e = new Error(message)
	if (Error.captureStackTrace) {
		Error.captureStackTrace(e, newError)
	}

	installSerializers(e)
	return e
}

/**
 * Returns a new error that wraps `originalError` as its cause, with a stack
 * trace trimmed to the caller. Modeled on efficientgo/core's errors.Wrap.
 * The chain is the platform-native ES2022 `Error.cause`; inspect it with
 * `errors.is`, `errors.as`, or `errors.cause` — never via static types.
 */
function wrap(originalError: Error, message: string): Error {
	const e = new Error(message, { cause: originalError })
	if (Error.captureStackTrace) {
		Error.captureStackTrace(e, wrap)
	}

	installSerializers(e)
	return e
}

/**
 * Returns the deepest error in the chain: the first error whose `cause` is
 * not itself an Error instance. Returns the error itself when it has no
 * Error cause. Modeled on efficientgo/core's errors.Cause.
 */
function cause(error: Error): Error {
	let result: Error = error
	while (result.cause instanceof Error) {
		result = result.cause
	}

	return result
}

/**
 * Reports whether any error in the chain is identical (===) to target. The
 * chain is `err` followed by each successive Error-valued `cause`.
 */
function isError(err: Error, target: Error): boolean {
	let currentError: Error | undefined = err
	while (currentError !== undefined && currentError !== null) {
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
 * Returns the first error in the chain that is an instance of `ErrorClass`,
 * or undefined. This is the one place a type parameter earns its keep: the
 * return value is genuinely narrowed to the class you asked for.
 */
function asError<U extends Error>(err: Error, ErrorClass: abstract new (...args: never[]) => U): U | undefined {
	let currentError: Error | undefined = err
	while (currentError !== undefined && currentError !== null) {
		if (currentError instanceof ErrorClass) {
			return currentError
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
 * Awaits a promise into a Result instead of a throw. A non-Error rejection
 * value is converted to an Error carrying its string form. The `E` type
 * parameter is a pragmatic caller assertion (like Go's errors.As target) —
 * the runtime performs no check beyond Error-ness.
 */
async function tryCatch<T, E extends Error = Error>(promise: Promise<T>): Promise<Result<T, E>> {
	try {
		const data = await promise
		return { data, error: undefined }
	} catch (error) {
		const finalError = (error instanceof Error ? error : new Error(String(error))) as E
		return { data: undefined, error: finalError }
	}
}

/**
 * Runs a synchronous function into a Result instead of a throw. Same
 * conversion and `E` semantics as `errors.try`.
 */
function trySync<T, E extends Error = Error>(fn: () => T): Result<T, E> {
	try {
		const data = fn()
		return { data, error: undefined }
	} catch (error) {
		const finalError = (error instanceof Error ? error : new Error(String(error))) as E
		return { data: undefined, error: finalError }
	}
}

export { asError as as, cause, isError as is, newError as new, tryCatch as try, trySync, wrap }
