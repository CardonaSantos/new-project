// Para estados que lo necesiten: no introducir transiciones artificiales en el POS.
export function assertTransition<T extends string>(
 current:T,next:T,allowed:Readonly<Record<T,readonly T[]>>
):void{
 if(!allowed[current].includes(next))throw new Error(`Transición inválida: ${current} -> ${next}`);
}
