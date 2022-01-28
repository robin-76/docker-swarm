# IoT - Docker Swarm

- Année : M2 IWOCS
- Sujet : Docker

## Auteurs

|Nom|Prénom|
|--|--|
| *GUYOMAR* | *Robin*|
| *BOURGEAUX* | *Maxence*|

## Utilisations

### Utilisation NodeJS

On commence par installer les dépendances avec la commande :

    npm i

Puis on peut lancer le projet avec :

    npm start

### Utilisation via Docker

Il suffit de faire les deux commandes suivantes dans un terminal : 

    docker swarm leave --force

Puis

    docker-compose up

Pour quitter, on ouvre un deuxième terminal et on utilise la commande :

    docker-compose down