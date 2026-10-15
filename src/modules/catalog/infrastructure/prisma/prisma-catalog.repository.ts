import {Injectable} from '@nestjs/common';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {CatalogRepositoryPort,type Paging,type Options,type CategoryInput,type ProductInput,type VariantInput,
 type GroupInput,type ModifierInput,type PriceInput,type MenuInput,type MenuLayout,type CatalogKind} from '../../application/ports/catalog.repository.port.js';
import {scope} from './catalog-prisma.shared.js';
import {CatalogCommercialStore} from './catalog-commercial.store.js';
import {CatalogPricingStore} from './catalog-pricing.store.js';
import {CatalogMenuStore} from './catalog-menu.store.js';
import {CatalogReportStore} from './catalog-report.store.js';
@Injectable()
export class PrismaCatalogRepository extends CatalogRepositoryPort{
 constructor(private readonly db:PrismaService,private readonly commercial:CatalogCommercialStore,
  private readonly pricing:CatalogPricingStore,private readonly menuStore:CatalogMenuStore,
  private readonly reports:CatalogReportStore){super();}
 scope(user:string,code:string){return scope(this.db,user,code);}
 categories(f:Paging){return this.commercial.categories(f);}
 categoryOptions(f:Options){return this.commercial.categoryOptions(f);}
 categoryTree(){return this.commercial.categoryTree();}
 category(id:string){return this.commercial.category(id);}
 createCategory(a:string,v:CategoryInput){return this.commercial.createCategory(a,v);}
 updateCategory(a:string,id:string,v:Partial<CategoryInput>){return this.commercial.updateCategory(a,id,v);}
 statusCategory(a:string,id:string,active:boolean,motive:string){return this.commercial.statusCategory(a,id,active,motive);}
 products(f:Paging&{categoriaId?:string;tipo?:CatalogKind}){return this.commercial.products(f);}
 productOptions(f:Options&{sucursalId?:string}){return this.commercial.productOptions(f);}
 product(id:string,b?:string){return this.commercial.product(id,b);}
 createProduct(a:string,v:ProductInput){return this.commercial.createProduct(a,v);}
 updateProduct(a:string,id:string,v:{nombre?:string;descripcion?:string|null;categoriaId?:string|null;visibleEnMenu?:boolean}){return this.commercial.updateProduct(a,id,v);}
 statusProduct(a:string,id:string,active:boolean,motive:string){return this.commercial.statusProduct(a,id,active,motive);}
 createVariant(a:string,p:string,v:VariantInput){return this.commercial.createVariant(a,p,v);}
 updateVariant(a:string,id:string,v:Partial<VariantInput>&{activo?:boolean}){return this.commercial.updateVariant(a,id,v);}
 variant(id:string,b?:string){return this.commercial.variant(id,b);}
 variantOptions(f:Options&{productoId?:string;sucursalId?:string}){return this.commercial.variantOptions(f);}
 variantBranch(a:string,id:string,b:string,v:{habilitada:boolean;pausadaHasta?:string|null;motivo?:string|null}){return this.commercial.variantBranch(a,id,b,v);}
 modifierGroups(f:Paging){return this.pricing.modifierGroups(f);}
 groupOptions(f:Options){return this.pricing.groupOptions(f);}
 createGroup(a:string,v:GroupInput){return this.pricing.createGroup(a,v);}
 updateGroup(a:string,id:string,v:Partial<GroupInput>&{activo?:boolean}){return this.pricing.updateGroup(a,id,v);}
 modifiers(f:Paging&{grupoId?:string}){return this.pricing.modifiers(f);}
 createModifier(a:string,v:ModifierInput){return this.pricing.createModifier(a,v);}
 updateModifier(a:string,id:string,v:Partial<Omit<ModifierInput,'grupoId'>>&{activo?:boolean}){return this.pricing.updateModifier(a,id,v);}
 attachGroups(a:string,id:string,v:Array<{grupoId:string;orden:number;obligatorio:boolean}>){return this.pricing.attachGroups(a,id,v);}
 createVariantPrice(a:string,v:PriceInput){return this.pricing.createVariantPrice(a,v);}
 createModifierPrice(a:string,v:PriceInput){return this.pricing.createModifierPrice(a,v);}
 variantPriceHistory(id:string,b:string){return this.pricing.variantPriceHistory(id,b);}
 modifierPriceHistory(id:string,b:string){return this.pricing.modifierPriceHistory(id,b);}
 resolvePrice(id:string,b:string,at:Date){return this.pricing.resolvePrice(id,b,at);}
 quote(id:string,b:string,modifiers:string[],at:Date){return this.pricing.quote(id,b,modifiers,at);}
 menus(f:Paging,b?:string){return this.menuStore.menus(f,b);}
 menu(id:string){return this.menuStore.menu(id);}
 createMenu(a:string,v:MenuInput){return this.menuStore.createMenu(a,v);}
 updateMenu(a:string,id:string,v:{nombre?:string;descripcion?:string|null;activo?:boolean}){return this.menuStore.updateMenu(a,id,v);}
 replaceLayout(a:string,id:string,v:MenuLayout){return this.menuStore.replaceLayout(a,id,v);}
 publishMenu(a:string,id:string,version:number){return this.menuStore.publishMenu(a,id,version);}
 unpublishMenu(a:string,id:string){return this.menuStore.unpublishMenu(a,id);}
 branchMenu(b:string,at:Date){return this.menuStore.branchMenu(b,at);}
 productReadiness(id:string,b:string,at:Date){return this.menuStore.productReadiness(id,b,at);}
 replaceMedia(a:string,kind:'product'|'variant'|'category',id:string,ids:string[]){return this.commercial.replaceMedia(a,kind,id,ids);}
 summary(s:import('../../application/ports/catalog.repository.port.js').CatalogScope,b?:string){return this.reports.summary(s,b);}
 coverage(s:import('../../application/ports/catalog.repository.port.js').CatalogScope,b:string,at:Date){return this.reports.coverage(s,b,at);}
}
