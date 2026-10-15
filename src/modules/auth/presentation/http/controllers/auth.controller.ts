import {Body,Controller,Get,ForbiddenException,Headers,Patch,Post,Query,Req,Res} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import type {Request,Response} from 'express';
import {AuthService,type Principal} from '../../../application/auth.service.js';
import {CurrentUser,Public,AllowPasswordChange} from '../decorators/auth.decorators.js';
import {CapabilitiesDto,ChangePasswordDto,LoginDto} from '../dto/auth.dto.js';
const COOKIE='gastro_refresh';
const TTL=7*24*60*60*1000;
@Controller('auth')
export class AuthController {
 constructor(private readonly auth:AuthService,private readonly config:ConfigService){}
 private setCookie(res:Response,token:string){
  res.cookie(COOKIE,token,{httpOnly:true,secure:this.config.get<string>('NODE_ENV')==='production',
    sameSite:'lax',path:'/api/auth',maxAge:TTL});
 }
 private clearCookie(res:Response){res.clearCookie(COOKIE,{path:'/api/auth'});}
 private output<T extends {refreshToken:string}>(data:T):Omit<T,'refreshToken'>{
  const {refreshToken:secret,...response}=data;void secret;return response;
 }
 @Public()
 @Post('login')
 async login(@Body() dto:LoginDto,@Req() req:Request,@Res({passthrough:true}) res:Response){
  const result=await this.auth.login(dto.email,dto.password,req.ip??'unknown',req.headers['user-agent']??null);
  this.setCookie(res,result.refreshToken);
  return this.output(result);
 }
 @Public()
 @Post('refresh')
 async refresh(@Req() req:Request,@Res({passthrough:true}) res:Response){
  // Cookie-based token endpoint: fail closed on untrusted browser Origin.
  const origin=req.headers.origin;
  const allowed=(this.config.get<string>('CORS_ORIGINS')??'').split(',').map(x=>x.trim()).filter(Boolean);
  if(origin&&!allowed.includes(origin))throw new ForbiddenException('Origen no permitido');
  const token=req.cookies?.[COOKIE] as string|undefined;
  if(!token)throw new ForbiddenException('Refresh token requerido');
  const result=await this.auth.refresh(token);
  this.setCookie(res,result.refreshToken);
  return this.output(result);
 }
 @AllowPasswordChange()
 @Post('logout')
 async logout(@CurrentUser() user:Principal,@Res({passthrough:true}) res:Response){
  await this.auth.logout(user);this.clearCookie(res);return {ok:true};
 }
 @AllowPasswordChange()
 @Post('logout-all')
 async logoutAll(@CurrentUser() user:Principal,@Res({passthrough:true}) res:Response){
  await this.auth.logoutAll(user);this.clearCookie(res);return {ok:true};
 }
 @AllowPasswordChange()
 @Patch('password')
 async password(@CurrentUser() user:Principal,@Body() dto:ChangePasswordDto,@Res({passthrough:true}) res:Response){
  await this.auth.changePassword(user,dto.oldPassword,dto.newPassword);
  this.clearCookie(res);return {ok:true,reloginRequired:true};
 }
 @AllowPasswordChange()
 @Get('me')
 me(@CurrentUser() user:Principal){return this.auth.me(user);}
 @Get('capabilities')
 capabilities(@CurrentUser() user:Principal,@Query() dto:CapabilitiesDto){
  return this.auth.capabilities(user,dto.sucursalId??null);
 }
}
