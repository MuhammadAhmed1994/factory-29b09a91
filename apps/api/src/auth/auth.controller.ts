import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, AuthSessionResult } from './auth.service';
import { GoogleSessionDto } from './dto/google-session.dto';
import { Public } from './public.decorator';

@Controller('auth/google')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  createGoogleSession(@Body() dto: GoogleSessionDto): Promise<AuthSessionResult> {
    return this.authService.createGoogleSession(dto);
  }
}
