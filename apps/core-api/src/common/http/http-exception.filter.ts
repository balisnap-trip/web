import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import { randomUUID } from "crypto";

@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = "INTERNAL_ERROR";
    let message = "Unexpected error";
    let details: unknown = null;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === "string") {
        message = payload;
        errorCode = this.codeFromStatus(statusCode);
      } else if (payload && typeof payload === "object") {
        const objectPayload = payload as Record<string, unknown>;
        message =
          typeof objectPayload.message === "string"
            ? objectPayload.message
            : this.defaultMessageByStatus(statusCode);
        errorCode =
          typeof objectPayload.error === "string"
            ? this.normalizeCode(objectPayload.error)
            : this.codeFromStatus(statusCode);
        details = objectPayload;
      } else {
        message = this.defaultMessageByStatus(statusCode);
        errorCode = this.codeFromStatus(statusCode);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      errorCode = "UNHANDLED_EXCEPTION";
    }

    response.status(statusCode).json({
      error: {
        code: errorCode,
        message,
        details,
        requestId: randomUUID()
      }
    });
  }

  private codeFromStatus(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return "VALIDATION_ERROR";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      default:
        return "HTTP_ERROR";
    }
  }

  private defaultMessageByStatus(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return "Bad request";
      case HttpStatus.UNAUTHORIZED:
        return "Unauthorized";
      case HttpStatus.FORBIDDEN:
        return "Forbidden";
      case HttpStatus.NOT_FOUND:
        return "Not found";
      case HttpStatus.CONFLICT:
        return "Conflict";
      default:
        return "Unexpected error";
    }
  }

  private normalizeCode(raw: string): string {
    return raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  }
}
