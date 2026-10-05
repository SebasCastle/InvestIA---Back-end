import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketDataError, publicMarketMessage } from './market-data.provider';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
@UseGuards(JwtAuthGuard)
export class MarketDataController {
  constructor(private readonly marketData: MarketDataService) {}

  @Get('search')
  search(@Query('q') query = '') {
    const term = query.trim();
    if (term.length < 1 || term.length > 40) {
      throw new BadRequestException('Escribe un símbolo o un nombre para buscar');
    }
    return this.marketData.search(term).catch((error: unknown) => {
      throw this.asHttp(error);
    });
  }

  @Get('quotes')
  quotes(@Query('symbols') symbols = '') {
    const list = symbols
      .split(',')
      .map((symbol) => symbol.trim())
      .filter(Boolean);
    if (list.length === 0) {
      throw new BadRequestException('Indica al menos un símbolo');
    }
    if (list.length > 50) {
      throw new BadRequestException('Demasiados símbolos');
    }
    return this.marketData.getQuotes(list);
  }

  @Get('history/:symbol/session')
  async session(@Param('symbol') symbol: string, @Query('date') date?: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
      throw new BadRequestException('Indica la fecha en formato AAAA-MM-DD');
    }
    try {
      return await this.marketData.session(symbol, date);
    } catch (error) {
      throw this.asHttp(error);
    }
  }

  @Get('history/:symbol')
  async history(
    @Param('symbol') symbol: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Fechas inválidas');
    }

    const result = await this.marketData.getHistory(symbol, start, end);
    if (result.error && result.prices.length === 0) {
      throw new HttpException(publicMarketMessage(new Error(result.error)), 503);
    }
    return {
      symbol: symbol.trim().toUpperCase(),
      prices: result.prices,
      lastUpdated: new Date().toISOString(),
    };
  }

  @Get('news/:symbol')
  async news(@Param('symbol') symbol: string) {
    try {
      const articles = await this.marketData.getNews(symbol);
      return { symbol: symbol.trim().toUpperCase(), articles, lastUpdated: new Date().toISOString() };
    } catch (error) {
      throw this.asHttp(error);
    }
  }

  @Get('fundamentals/:symbol')
  async fundamentals(@Param('symbol') symbol: string) {
    try {
      return await this.marketData.getFundamentals(symbol);
    } catch (error) {
      throw this.asHttp(error);
    }
  }

  @Get('profile/:symbol')
  async profile(@Param('symbol') symbol: string) {
    try {
      return await this.marketData.getProfile(symbol);
    } catch (error) {
      throw this.asHttp(error);
    }
  }

  private asHttp(error: unknown): Error {
    if (error instanceof MarketDataError) {
      return new HttpException(publicMarketMessage(error), 503);
    }
    return error instanceof Error ? error : new Error('No se pudo consultar el mercado');
  }
}
