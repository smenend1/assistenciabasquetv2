# Assistència Bàsquet PWA - Multi Entitat

Versió amb suport per guardar diverses entitats i diversos equips per entitat.

## Funcionament

1. Afegeix una o més entitats.
2. Escull una entitat.
3. Afegeix un o més equips dins d'aquesta entitat.
4. Obre assistència.
5. Importa CSV de jugadors.
6. Els canvis es sincronitzen en temps real amb Firebase.

## Important

Les entitats i equips guardats al selector es desen al LocalStorage del dispositiu.
Això vol dir que cada mòbil pot guardar la seva llista d'accessos ràpids.

Les dades reals de jugadors i assistències es desen a Firestore.

## CSV d'exemple

```csv
Nom,Dorsal
"Martínez, Àlex",7
Núria López,12
João Silva,23
Laia Garcia,31
```

## Rutes Firestore

```txt
entitats/{entityId}/equips/{teamId}/jugadors/{playerId}
assistencies/{entityId}/dies/{date}/registres/{playerId}
assistencies/{entityId}/dies/{date}/meta/_meta
```
