import { AlertKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAlertDto {
  @IsEnum(AlertKind)
  kind: AlertKind;

  @Type(() => Number)
  @IsNumber()
  threshold: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  symbol?: string;

  @IsOptional()
  @IsUUID()
  portfolioId?: string;
}
