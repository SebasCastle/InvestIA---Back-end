import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('portfolios/:portfolioId/transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
  ) {
    return this.transactions.list(user.userId, portfolioId);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactions.get(user.userId, portfolioId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactions.create(user.userId, portfolioId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactions.remove(user.userId, portfolioId, id);
  }
}
