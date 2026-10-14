import {Injectable} from '@nestjs/common';
import {hash,verify,argon2id} from 'argon2';
import {PasswordHasher} from '../../application/ports/crypto.ports.js';
@Injectable()
export class Argon2Hasher extends PasswordHasher {
 hash(value:string){return hash(value,{type:argon2id,memoryCost:19456,timeCost:2,parallelism:1});}
 async verify(digest:string,value:string){try{return await verify(digest,value);}catch{return false;}}
}
