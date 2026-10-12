// Camera chapters change presentation only. State, clocks and purchases stay in ScenarioRun.
export function eventCamera(def,state){
 if(def.id==='forge'&&state.t>=10)return {key:'forge/gate',camera:[10,9,-39],focus:[0,1.65,-24.5],caption:state.forgeConsumed?'Ворота: применение заказа':'Ворота: натиск без готового заказа'};
 if(def.id==='stores'&&state.choice==='water'&&state.operator?.x>-12.5+1e-6)return {key:'stores/water',camera:[-2,20,11],focus:[-.5,.8,-10.5],caption:state.storesBurned?'Склад: не успели до пожара':'Вода: весь маршрут через двор'};
 return {key:def.id+'/main',camera:def.camera,focus:def.focus,caption:def.id==='forge'?'Кузня: подготовка партии':def.id==='stores'?'Склад: пожар и спасённые запасы':def.id==='anchor'?'Лодка, трос и выход на стену':def.name};
}
