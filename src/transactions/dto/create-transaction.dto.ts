import { AssetType, TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const tradeTypes = new Set<TransactionType>([
  TransactionType.BUY,
  TransactionType.SELL,
  TransactionType.DIVIDEND,
]);

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type: TransactionType;

  @ValidateIf((dto: CreateTransactionDto) => tradeTypes.has(dto.type))
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  symbol?: string;

  @ValidateIf((dto: CreateTransactionDto) => tradeTypes.has(dto.type))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ValidateIf((dto: CreateTransactionDto) => tradeTypes.has(dto.type))
  @IsEnum(AssetType)
  assetType?: AssetType;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  exchange?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  quantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  fees?: number;

  @IsDateString()
  executedAt: string;
}
