import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { HoldingsService, parsePerformanceRange } from './holdings.service';
import { PortfolioService } from './portfolio.service';

@Controller('portfolios')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(
    private readonly portfolios: PortfolioService,
    private readonly holdings: HoldingsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.holdings.list(user.userId);
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser, @Query('range') range?: string) {
    return this.holdings.overview(user.userId, parsePerformanceRange(range));
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePortfolioDto) {
    const portfolio = await this.portfolios.create(user.userId, dto);
    return {
      id: portfolio.id,
      name: portfolio.name,
      currency: portfolio.currency,
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
    };
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const portfolio = await this.portfolios.requireOwned(user.userId, id);
    return {
      id: portfolio.id,
      name: portfolio.name,
      currency: portfolio.currency,
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
      summary: await this.holdings.summary(user.userId, id),
    };
  }

  @Get(':id/performance')
  performance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('range') range?: string,
  ) {
    return this.holdings.performance(user.userId, id, parsePerformanceRange(range));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    const portfolio = await this.portfolios.update(user.userId, id, dto);
    return {
      id: portfolio.id,
      name: portfolio.name,
      currency: portfolio.currency,
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.portfolios.remove(user.userId, id);
  }
}

