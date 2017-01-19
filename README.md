# gpx-viewer

## Getting started

This GPX Viewer is able to load many tracks at a time.<br/>
It allows you to compare them.<br/>
You can use many different map layers.

You can try it here: http://evrignaud.github.io/gpx-viewer/<br/>
**Just drag & drop GPX files in it.**

## Building & running it yourself

Before you start, make sure you have a recent version of [NodeJS](http://nodejs.org/) environment *>=4.0* with yarn.

From the project folder, execute the following commands:

```shell
yarn install
```

This will install all required dependencies, including a local version of Webpack that is going to
build and bundle the app. There is no need to install Webpack globally. 

Then build the project to retrieve all the mandatory dependencies

```shell
yarn build
```

To run the app execute the following command:

```shell
yarn start
```

or

```shell
WEBPACK_HOST=<you ip> yarn start
```

This command starts the webpack development server that serves the build bundles.
You can now browse the skeleton app at http://localhost:9000. Changes in the code
will automatically build and reload the app.
