# End-to-end tests

There is no GUI or runnable application in the foundation phase, so this
directory contains no dummy UI tests. `playwright.config.ts` targets this
directory and can gain Electron or desktop GUI projects when the application
exists. A GUI test run may then launch the real app and verify user-visible
flows; it is not part of required CI yet.
