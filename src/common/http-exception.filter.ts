import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : typeof body === 'object' && body && 'message' in body
            ? (body as { message: unknown }).message
            : exception.message;
      response.status(status).json({
        statusCode: status,
        message,
        error: HttpStatus[status] ?? 'Error',
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.message : 'Error no controlado');
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'No se pudo completar la solicitud',
      error: 'Internal Server Error',
    });
  }
}
