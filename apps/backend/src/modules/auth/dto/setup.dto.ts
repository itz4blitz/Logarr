import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class SetupDto {
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens',
  })
  username!: string;

  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least 12 characters, including uppercase, lowercase, and a number',
  })
  password!: string;

  @IsString()
  @MinLength(64)
  @MaxLength(64)
  setupToken!: string;
}
