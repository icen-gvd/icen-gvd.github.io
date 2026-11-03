# CallCenter GVD

Registro de gestiones de televentas y reporte en vivo para Grupo Vega Distribución, sobre Supabase.

- **Supervisor** (rol `admin`): módulos **Registrar** y **Reporte**.
- **Vendedor** (rol `vendedor`): solo **Registrar**.
- Las reprogramaciones avisan con la campana a la hora pactada.
- Lo que se registra aparece al instante en el reporte del supervisor (Supabase Realtime).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La página |
| `app.js` | Lógica: login, formulario, agenda, reporte y tiempo real |
| `app.css` | Estilos (sobre Bootstrap 5.3) |
| `config.js` | URL y clave publicable de Supabase, meta diaria |
| `historico.js` | Análisis agregado del Excel BD_CallCenter (sin nombres ni teléfonos) |

La clave de `config.js` es la **publicable**: está hecha para ir en el navegador. Los datos los protegen las reglas RLS de la base: sin iniciar sesión no se lee nada, cada vendedor solo ve y registra sus propias gestiones, y el supervisor ve todo.

## Dar acceso a una persona

Cada persona entra con su **código** (ej. `01CALL02`) y una contraseña. Por dentro, la cuenta usa el correo `<código en minúsculas>@callcenter.icen`, que no recibe mensajes: es solo un identificador.

1. En Supabase: **Authentication → Users → Add user → Create new user**.
2. **Email:** el código en minúsculas + `@callcenter.icen`, por ejemplo `01call02@callcenter.icen`. Para el supervisor: `sup-call@callcenter.icen`.
3. **Password:** la contraseña que le darás a esa persona.
4. Marca **Auto Confirm User** y crea.

La cuenta se enlaza sola con su fila de `vendedores` (un trigger de la base lo hace). El rol sale de esa fila: `SUP-CALL` es supervisor (`admin`); los códigos CALL son vendedores.

Para que otra persona sea supervisor:

```sql
update public.vendedores set rol = 'admin' where codigo = '02CALL10';
```

Para quitar el acceso: `update public.vendedores set activo = false where codigo = '...';`

## Publicación

Es un sitio estático: GitHub Pages lo sirve tal cual desde la rama `main` (carpeta raíz).
