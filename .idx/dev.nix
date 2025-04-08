# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-23.11"; # or "unstable"
  # Use https://search.nixos.org/packages to find packages
  packages = [ pkgs.bun ];
  # Sets environment variables in the workspace
  env = { EXPO_USE_FAST_RESOLVER = 1; };
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "msjsdiag.vscode-react-native"
    ];
    workspace = {
      # Runs when a workspace is first created with this `dev.nix` file
      onCreate = {
        install =
          "bun ci --prefer-offline --no-audit --no-progress --timing && bun i @expo/ngrok@^4.1.0";
      };
      # Runs when a workspace restarted
      onStart = {
        android = ''
          echo -e "\033[1;33mWaiting for Android emulator to be ready...\033[0m"
          # Wait for the device connection command to finish
          adb -s emulator-5554 wait-for-device && \
          bun run android -- --tunnel
        '';
      };
    };
    # Enable previews and customize configuration
    previews = {
      enable = true;
      previews = {
        web = {
          command = [ "bun" "run" "web" "--" "--port" "$PORT" ];
          manager = "web";
          cwd = "client";
        };
        android = {
          # noop
          command = [ "tail" "-f" "/dev/null" ];
          manager = "web";
          cwd = "client";
        };
      };
    };
  };
}
