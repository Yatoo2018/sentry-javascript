import { addBreadcrumb } from '@sentry/minimal';
import { Integration, Severity } from '@sentry/types';
import { fill } from '@sentry/utils/object';
import { format } from 'util';

/**
 * Wrapper function for internal _load calls within `require`
 */
function loadWrapper(nativeModule: any): any {
  // We need to use some functional-style currying to pass values around
  // as we cannot rely on `bind`, because this has to preserve correct
  // context for native calls
  return function(originalLoad: () => any): any {
    return function(moduleId: string): any {
      const originalModule = originalLoad.apply(nativeModule, arguments);

      if (moduleId !== 'console') {
        return originalModule;
      }

      ['debug', 'info', 'warn', 'error', 'log'].forEach(
        consoleWrapper(originalModule),
      );

      return originalModule;
    };
  };
}

/**
 * Wrapper function that'll be used for every console level
 */
function consoleWrapper(originalModule: any): any {
  return function(level: string): any {
    if (!(level in originalModule)) {
      return;
    }

    fill(originalModule, level, function(originalConsoleLevel: () => any): any {
      let sentryLevel: Severity;

      switch (level) {
        case 'debug':
          sentryLevel = Severity.Debug;
          break;
        case 'error':
          sentryLevel = Severity.Error;
          break;
        case 'info':
          sentryLevel = Severity.Info;
          break;
        case 'warn':
          sentryLevel = Severity.Warning;
          break;
        default:
          sentryLevel = Severity.Log;
      }

      return function(): any {
        addBreadcrumb({
          category: 'console',
          level: sentryLevel,
          message: format.apply(undefined, arguments),
        });

        originalConsoleLevel.apply(originalModule, arguments);
      };
    });
  };
}

/** Console module integration */
export class Console implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Console';
  /**
   * @inheritDoc
   */
  public install(): void {
    const nativeModule = require('module');
    fill(nativeModule, '_load', loadWrapper(nativeModule));
    // special case: since console is built-in and app-level code won't require() it, do that here
    require('console');
  }
}
