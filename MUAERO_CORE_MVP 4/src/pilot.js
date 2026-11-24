// E01 is confirmed by the university's campus guide; this coordinate is only
// the south end of OSM way 1120956407, NOT a surveyed gate entrance.
export const GATE_PATH_ANCHOR={lat:35.1723634,lng:126.9046448};
export const PILOT_BBOX={south:35.1720,west:126.9042,north:35.1776,east:126.9075};
export function withinPilot(p){return p.lat>=PILOT_BBOX.south&&p.lat<=PILOT_BBOX.north&&p.lng>=PILOT_BBOX.west&&p.lng<=PILOT_BBOX.east;}
export function visualFacade(building){
 const name=building.name||'';
 if(name==='중앙도서관')return {wall:'#9b534d',roof:'#a9aaa6',window:'#344c55',accent:'#d5c7b6',source:'영상 색채 관찰 + OSM 5층 태그; 정확한 입면·출입구 미확인'};
 if(name==='민주마루')return {wall:'#b1b6b2',roof:'#c8ccc8',window:'#3c5861',accent:'#e1e4dc',source:'시각화용 재질 추정'};
 if(name==='용봉관')return {wall:'#c0bbb0',roof:'#cfcec6',window:'#4c6269',accent:'#d7d6ce',source:'시각화용 재질 추정'};
 const tag=building.tags?.building;
 const families={university:['#a98174','#aea69a','#aaa493','#b19b86'],commercial:['#918e89','#a8a9a5','#b9ada1','#999f9a'],apartments:['#c7c4b8','#b3b5b1','#c1b8b1','#b3b3a8'],residential:['#c3af9d','#b6a599','#c6b9a8','#b4aaa0'],school:['#ad9c89','#b6aaa0','#b6a596','#a69c92']};
 const palette=families[tag]||['#bcb5a7','#aeb4ad','#c6b6a5','#b4aaa1','#adada7','#bea99d'];
 const index=Number(BigInt(String(building.id).replace(/\D/g,'')||'0')%BigInt(palette.length));
 return {wall:palette[index],roof:'#b7b8b1',window:'#425b63',accent:'#d0cdc0',source:'OSM 건물 외곽·용도 외관 색채 시각화 추정'};
}
