import {describe,it,expect} from 'vitest';
import {detectMime,enforceSize,generateStorageKey,supportedMime} from './media-file-rules.js';

describe('Media rules',()=>{
 it('identifica PDF por contenido, no por extensión',async()=>{
  expect(await detectMime(Buffer.from('%PDF-1.7\n1 0 obj\n'))).toBe('application/pdf');
 });
 it('rechaza tipos ejecutables o SVG',()=>{
  expect(()=>supportedMime('image/svg+xml')).toThrow();
  expect(()=>supportedMime('text/html')).toThrow();
 });
 it('limita tamaño para una carga en memoria',()=>{
  expect(()=>enforceSize('image/jpeg',11*1024*1024,20*1024*1024,200*1024*1024)).toThrow();
  expect(()=>enforceSize('video/mp4',25*1024*1024,20*1024*1024,200*1024*1024)).toThrow();
 });
 it('genera claves aisladas sin entrada arbitraria del usuario',()=>{
  const key=generateStorageKey('gastro-core','PERFIL','image/png');
  expect(key).toMatch(/^gastro-core\/media\/perfil\/imagen\/\d{4}\/\d{2}\/\d{2}\/[\w-]+\.png$/);
  expect(generateStorageKey('gastro-core','PERFIL','image/png')).not.toBe(key);
 });
});
