import {describe,expect,it} from 'vitest';
import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';
import {CatalogCategoriesController} from './catalog-products.controller.js';
import {CatalogReportsController} from './catalog-reports.controller.js';
import {PageDto,PriceQueryDto} from './dto/catalog.dto.js';

describe('CAT-A query validation and Nest runtime metadata',()=>{
 it('retains concrete DTO metadata for category pagination and price coverage',()=>{
  const categoryTypes=Reflect.getMetadata('design:paramtypes',CatalogCategoriesController.prototype,'list') as unknown[];
  const coverageTypes=Reflect.getMetadata('design:paramtypes',CatalogReportsController.prototype,'coverage') as unknown[];
  expect(categoryTypes[1]).toBe(PageDto);
  expect(coverageTypes[1]).toBe(PriceQueryDto);
 });
 it('converts a normal HTTP page query to integer skip/take parameters',async()=>{
  const query=plainToInstance(PageDto,{page:'2',limit:'20',search:'Cafés',activo:'true'});
  expect(await validate(query)).toEqual([]);
  expect(query.page).toBe(2);
  expect(query.limit).toBe(20);
  expect(query.activo).toBe(true);
  expect((query.page-1)*query.limit).toBe(20);
 });
 it('rejects invalid pagination and undeclared properties',async()=>{
  const query=plainToInstance(PageDto,{page:'0',limit:'200',sucursalId:'wrong-scope'});
  const errors=await validate(query,{whitelist:true,forbidNonWhitelisted:true});
  expect(errors.some(error=>error.property==='page')).toBe(true);
  expect(errors.some(error=>error.property==='limit')).toBe(true);
  expect(errors.some(error=>error.property==='sucursalId')).toBe(true);
 });
 it('allows only the documented branch context for price coverage',async()=>{
  const query=plainToInstance(PriceQueryDto,{sucursalId:'branch-1',fecha:'2026-11-02T18:00:00Z'});
  expect(await validate(query,{whitelist:true,forbidNonWhitelisted:true})).toEqual([]);
 });
});
