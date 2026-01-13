import { IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';

export class SetupDto {
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens',
  })
  username!: string;

  @IsString()
  @MinLength(8, {
    message: 'Password must be at least 8 characters',
  })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  setupToken?: string;
}
