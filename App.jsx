                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!clasesList.length&&<div style={{padding:24,textAlign:"center",color:t.textMuted}}>Sin alumnos registrados.</div>}
              </div>
              <Pagination page={clasPag.page} totalPages={clasPag.totalPages} setPage={clasPag.setPage} sectionRef={clasesRef} t={t}/>
            </div>

            {/* Pendientes de transferencia */}
            {pendientesTransferencia.length>0&&(
              <div ref={pendRef} style={{...S.card,marginBottom:24,border:`1px solid ${t.cardBorder}`,background:t.cardBg}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
                  <h3 style={{margin:0,color:t.text,fontWeight:800,fontSize:17}}>
                    Ventas pendientes de recepción
                    <span style={{marginLeft:10,background:"#f5efdd",color:"#8a5a12",borderRadius:999,fontSize:13,fontWeight:800,padding:"3px 10px",border:"1px solid #e6d4af"}}>{pendientesTransferencia.length}</span>
                  </h3>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <button type="button" disabled={procesandoPendientesLote} style={{...btn(false),padding:"7px 12px",fontSize:12,opacity:procesandoPendientesLote?0.5:1}}
                      onClick={alternarTodosPendientes}>{todasPendientesMarcadas?"Deseleccionar todo":"Seleccionar todo"}</button>
                    {pendientesMarcadas.length>0&&<>
                      <span style={{fontSize:12,color:t.textMuted}}>{pendientesMarcadas.length} seleccionada{pendientesMarcadas.length!==1?"s":""} · USD {pendientesMarcadas.reduce((sum,c)=>sum+safeNum(c.monto),0).toLocaleString("es-AR")}</span>
                      <button type="button" disabled={procesandoPendientesLote} style={{...btn(false,true),padding:"7px 13px",fontSize:12,opacity:procesandoPendientesLote?0.5:1}}
                        onClick={()=>{
                          const elegidas=pendientesMarcadas.slice();
                          const claves=elegidas.map(clavePendiente);
                          const vendedores=[...new Set(elegidas.map(c=>c.vendedor||"Sin vendedor"))].join(", ");
                          const suma=elegidas.reduce((sum,c)=>sum+safeNum(c.monto),0);
                          askConfirm("Recibir ventas seleccionadas",`¿Confirmás la recepción de ${elegidas.length} venta(s) por USD ${suma.toLocaleString("es-AR")}? Vendedores: ${vendedores}. Las que no están tildadas permanecerán pendientes.`,null,{label:"Marcar seleccionadas recibidas",showRecibeFinal:true,onConfirmFn:recibeFinal=>marcarPendientesSeleccionadasComoRecibidas(recibeFinal,claves)});
                        }}>
                        {procesandoPendientesLote?"Registrando...":"Marcar seleccionadas recibidas"}
                      </button>
                    </>}
                  </div>
                </div>
                <div style={{display:"grid",gap:8}}>
                  {pendientesTransferencia.map(c=>{
                    const clave=clavePendiente(c);
                    const marcada=pendientesSeleccionados.includes(clave);
                    return (
                    <div key={clave} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:12,background:t.dark?"#101827":"#ffffff",border:`1px solid ${marcada?t.accent:t.cardBorder}`,borderLeft:"4px solid #c8911f",gap:10,flexWrap:"wrap"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <input type="checkbox" checked={marcada} disabled={procesandoPendientesLote} onChange={()=>alternarPendiente(c)}
                          aria-label={`Seleccionar venta pendiente de ${c.nombre}, ${c.monto} dólares, vendedor ${c.vendedor}`}
                          style={{width:17,height:17,accentColor:t.accent,cursor:procesandoPendientesLote?"not-allowed":"pointer",flexShrink:0}}/>
                        <div>
                          <span style={{fontWeight:700,color:t.text,fontSize:14}}>{c.nombre}</span>
                          <span style={{color:t.textMuted,fontSize:12,marginLeft:10}}>{svcLabel(c.servicio)} · {c.monto} USD</span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#8a5a12",padding:"3px 10px",borderRadius:999,background:"#f7f0df",border:"1px solid #e7d8b1"}}>{c.vendedor}</span>
                        <span style={{fontSize:12,color:t.textMuted}}>{formatDate(c.fecha_inicio)}</span>
                        <button disabled={procesandoPendientesLote} style={{...btn(false,true),padding:"6px 14px",fontSize:12,opacity:procesandoPendientesLote?0.5:1}} onClick={()=>askConfirm("Marcar como recibido",`¿Confirmás que ${c.vendedor} ya transfirió ${c.monto} USD por ${c.nombre}?`,null,{label:"Recibido ✓",showRecibeFinal:true,onConfirmFn:(recibeFinal)=>marcarTransferido(c.id,c,recibeFinal)})}>
                          Marcar recibido
                        </button>
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            )}

            {/* Resumen mensual */}
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:24}}>
              <div style={S.card}>
                <h3 style={{marginTop:0,color:t.text,fontWeight:800,fontSize:18,marginBottom:16}}>Resumen mensual</h3>
                <div className="sc-table-wrap" style={{overflowX:"auto"}}>
                  <table style={S.table}>
                    <thead><TableHeader cols={["Mes","Plan trader","Plan inversor","Clases","Total","Tendencia"]} t={t}/></thead>
                    <tbody>
                      {resumenConTrend.map(r=>(
                        <tr key={r.key}>
                          <td style={{...S.td,fontWeight:700}}>{monthLabel(r.key)}</td>
                          <td style={S.td}>USD {r.mensual}</td>
                          <td style={S.td}>USD {r.anual}</td>
                          <td style={S.td}>USD {r.clases}</td>
                          <td style={{...S.td,fontWeight:800,color:t.accent}}>USD {r.total}</td>
                          <td style={S.td}>
                            {r.trend!=null&&<span style={{fontSize:12,fontWeight:700,color:r.trend>0?"#22c55e":r.trend<0?"#ef4444":t.textMuted}}>{r.trend>0?"↑":r.trend<0?"↓":"→"} {Math.abs(r.trend)}%</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={S.card}>
                <h3 style={{marginTop:0,color:t.text,fontWeight:800,fontSize:18,marginBottom:16}}>Vista rápida</h3>
                <div style={{display:"grid",gap:16}}>
                  {resumenConTrend.map(r=>{
                    const pct=Math.max((r.total/maxTotal)*100,4);
                    return(
                      <div key={r.key}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14,color:t.text}}>
                          <span style={{fontWeight:600}}>{monthLabel(r.key)}</span>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            {r.trend!=null&&<span style={{fontSize:11,fontWeight:700,color:r.trend>0?"#22c55e":r.trend<0?"#ef4444":t.textMuted}}>{r.trend>0?"↑":r.trend<0?"↓":"→"}{Math.abs(r.trend)}%</span>}
                            <strong style={{color:t.accent}}>USD {r.total}</strong>
                          </div>
                        </div>
                        <div style={{height:8,background:t.barBg,borderRadius:999,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:t.accentGrad,borderRadius:999}}/>
                        </div>
                        <div style={{marginTop:5,color:t.textMuted,fontSize:12}}>Mensuales: {r.vM} · Anuales: {r.vA} · Clases: {r.vC} · Publicidad: {r.vP}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
