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

1. En Supabase: **Authentication → Users → Add user → Create new user**, con su correo y una contraseña. Marca **Auto Confirm User**.
2. En **SQL Editor**, enlaza ese usuario con su código:

```sql
-- Vendedor que ya está en la tabla vendedores
update public.vendedores
set user_id = (select id from auth.users where email = 'correo@grupovegadistribucion.pe')
where codigo = '01CALL02';

-- Supervisor (se crea su fila con rol admin)
insert into public.vendedores (codigo, nombre, rol, user_id)
values ('SUP-CALL', 'NOMBRE DEL SUPERVISOR', 'admin',
        (select id from auth.users where email = 'supervisor@grupovegadistribucion.pe'))
on conflict (codigo) do update set rol = 'admin', user_id = excluded.user_id;
```

Para quitar el acceso: `update public.vendedores set activo = false where codigo = '...';`

## Publicación

Es un sitio estático: GitHub Pages lo sirve tal cual desde la rama `main` (carpeta raíz).
