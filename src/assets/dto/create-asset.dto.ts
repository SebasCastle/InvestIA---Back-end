import { AssetType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateAssetDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  symbol: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsEnum(AssetType)
  type: AssetType;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  exchange: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(3, 10)
  @Matches(/^[A-Z]+$/)
  currency: string;
}
